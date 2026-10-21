using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Xml;
using LiveSplit.Model;
using LiveSplit.UI;
using LiveSplit.UI.Components;

[assembly: AssemblyVersion("1.0.9.0")]
[assembly: ComponentFactory(typeof(LiveSplit.ZombiesTracker.Factory))]

namespace LiveSplit.ZombiesTracker
{
    public sealed class Factory : IComponentFactory
    {
        public string ComponentName { get { return "Zombies Tracker"; } }
        public string Description { get { return "Solo BO2/BO3 Easter Egg tracking with automatic map/category detection."; } }
        public ComponentCategory Category { get { return ComponentCategory.Other; } }
        public IComponent Create(LiveSplitState state) { return new TrackerComponent(state); }
        public string UpdateName { get { return ComponentName; } }
        public string XMLURL { get { return UpdateURL + "update.LiveSplit.ZombiesTracker.xml"; } }
        public string UpdateURL { get { return "https://raw.githubusercontent.com/PenguineSussy/zombies-tracker/main/livesplit-addon/update/"; } }
        public Version Version { get { return new Version(AddonUpdates.InstalledVersion); } }
    }
    public sealed class AddonOptions
    {
        public bool Enabled;
        public string Server = "https://doctormonty.beer", Token = "", Map = "", Category = "", Game = "";
        public bool Practice;
        public List<SplitLink> Aliases = new List<SplitLink>();
    }
    public sealed class TrackerComponent : LogicComponent
    {
        sealed class Continuity
        {
            public TrackerComponent Owner;
            public object Run;
            public string Config, Id, Identity, LastPhase, Frozen;
            public long Sequence;
            public bool First, ForceNew, SuppressNext;
        }
        static readonly ConditionalWeakTable<LiveSplitState, Continuity> continuity = new ConditionalWeakTable<LiveSplitState, Continuity>();
        readonly Continuity runtime;
        readonly LiveSplitState state;
        readonly SettingsPanel panel;
        readonly Timer timer;
        readonly AddonUpdates updates = new AddonUpdates();
        AddonOptions options = new AddonOptions();
        UploadQueue uploader;
        readonly JavaScriptSerializer json = new JavaScriptSerializer();
        string id = Guid.NewGuid().ToString(), identity, lastPhase, frozen;
        long sequence;
        DateTime lastHeartbeat = DateTime.MinValue, lastRecords = DateTime.MinValue;
        bool first = true, forceNew = true, disposed, suppressNext = true;
        bool activated;
        object observedRun;
        string protectedToken = "";
        string protectedTokenFor = "";
        public override string ComponentName { get { return "Zombies Tracker"; } }
        public TrackerComponent(LiveSplitState state)
        {
            this.state = state;
            observedRun = state.Run;
            runtime = continuity.GetValue(state, s => new Continuity());
            panel = new SettingsPanel(Apply, ClearQueue);
            RefreshRunContext();
            panel.LoadOptions(options);
            state.OnStart += Started;
            state.OnSplit += Changed;
            state.OnUndoSplit += Changed;
            state.OnSkipSplit += Changed;
            state.OnPause += Changed;
            state.OnResume += Changed;
            state.OnUndoAllPauses += Changed;
            state.OnReset += Reset;
            timer = new Timer { Interval = 1000 };
            timer.Tick += Tick;
            timer.Start();
        }
        void Started(object sender, EventArgs e) { forceNew = true; Capture(true); }
        void Reset(object sender, TimerPhase previous) { forceNew = true; frozen = null; Capture(true, true); }
        void Changed(object sender, EventArgs e) { Capture(true); }
        void Tick(object sender, EventArgs e)
        {
            if (disposed) return;
            RefreshRunContext();
            if (activated && !InCurrentLayout()) { Deactivate(); return; }
            // Rendering can be suspended or omit a logic-only component. The UI
            // timer may activate it too, but only in the currently installed layout.
            if (!activated) Activate();
            if (!activated || disposed || runtime.Owner != this) return;
            updates.Tick(options.Server); panel.UpdateText = updates.Status;
            try { EnsureUploader(); } catch (Exception ex) { panel.StatusText = "Connection waiting: " + ex.Message; return; }
            if ((DateTime.UtcNow - lastHeartbeat).TotalSeconds >= 5) Capture(false);
            if (uploader != null) uploader.Flush();
        }
        Dictionary<string,string> Variables()
        {
            var variables = new Dictionary<string,string>();
            if (state.Run.Metadata != null)
            {
                foreach (var v in state.Run.Metadata.VariableValueNames) variables[v.Key] = v.Value;
                foreach (var v in state.Run.Metadata.CustomVariables) variables[v.Key] = v.Value.Value;
            }
            return variables;
        }
        void RefreshRunContext()
        {
            try {
                var detected = Detector.Detect(state.Run.GameName, state.Run.CategoryName,
                    Path.GetFileNameWithoutExtension(state.Run.FilePath ?? ""), Variables(),
                    state.Run.Select(s => s.Name), "", options.Aliases);
                var name = Detector.Normalize(state.Run.GameName);
                if(name.EndsWith(" zombies")) name=name.Substring(0,name.Length-8);
                var detectedGame = detected.Success ? (Detector.IsBo2(detected.Map)?"bo2":"bo3") :
                    new[]{"bo2","boii","black ops 2","black ops ii","call of duty black ops 2","call of duty black ops ii"}.Contains(name)?"bo2":
                    new[]{"bo3","boiii","black ops 3","black ops iii","call of duty black ops 3","call of duty black ops iii"}.Contains(name)?"bo3":"";
                panel.FollowRun(detected.Map, detectedGame);
            } catch(Exception ex) { panel.StatusText="Finish or delete the incomplete alias row before switching maps: "+ex.Message; }
        }
        void Capture(bool transition, bool resetEvent = false)
        {
            if (disposed || !activated || runtime.Owner != this || !InCurrentLayout()) return;
            try
            {
                if (!ReferenceEquals(observedRun, state.Run)) {
                    observedRun = state.Run;
                    forceNew = true; first = true; suppressNext = true; frozen = null;
                }
                var variables = Variables();
                string title = Path.GetFileNameWithoutExtension(state.Run.FilePath ?? "");
                var detected = Detector.Detect(state.Run.GameName, state.Run.CategoryName, title, variables, state.Run.Select(s => s.Name), options.Map, options.Aliases, options.Game);
                var category = Detector.IsBo2(detected.Map) ? Detector.Bo2Category(new[]{state.Run.CategoryName, title}.Concat(variables.Where(v=>Detector.Normalize(v.Key).Contains("category")||Detector.Normalize(v.Key).Contains("bank")||Detector.Normalize(v.Key).Contains("side")).Select(v=>v.Value)), options.Category, detected.Map) : Detector.MetadataCategory(state.Run.CategoryName, variables, options.Category, detected.Map);
                panel.DetectionText = detected.Reason + "\r\n" + (category == null ? "Gum category unknown or conflicting; choose a category override." : category + " / Solo / Easter Egg / " + (Detector.IsBo2(detected.Map)?"IGT + RTA":"RTA"));
                if (!options.Enabled || uploader == null) { panel.StatusText = "Not uploading. Configure settings, then enable and Apply."; return; }
                if (detected.NonSolo) throw new InvalidOperationException("Multiplayer detected. Only Solo runs are supported; no upload sent.");
                if (!detected.Success || category == null) { panel.StatusText = !detected.Success ? "Unsupported game/map - tracking paused." : "Not uploading: resolve category above."; suppressNext = true; return; }
                if (!Detector.CategoriesForMap(detected.Map).Contains(category)) { panel.StatusText = "Not uploading: this map allows only " + string.Join(", ", Detector.CategoriesForMap(detected.Map)) + "."; return; }
                string phase = state.CurrentPhase.ToString();
                var profile = new RunProfile { map = detected.Map, category = category, players = 1, timing = Detector.IsBo2(detected.Map)?"GameTime":"RealTime", game = Detector.IsBo2(detected.Map)?"bo2":"bo3" };
                string bridgeStatus;
                var autosplitNames = AutosplitBridge.Read(state, detected.Map, out bridgeStatus);
                var linkedNames = ManualAliases.Resolve(options.Aliases, detected.Map, state.Run.Select(s => s.Name).ToArray(), autosplitNames);
                bool hasManual = options.Aliases.Any(r=>r.Map==detected.Map && state.Run.Any(segment=>Detector.Normalize(segment.Name)==Detector.Normalize(r.Source)));
                string fingerprint = json.Serialize(profile) + "|" + options.Practice + "|" + string.Join("|", state.Run.Select(s => s.Name)) + "|" + string.Join("|",linkedNames);
                bool idle = state.CurrentPhase == TimerPhase.NotRunning;
                // Never turn an existing attempt into another category after an edit.
                if (!idle && !forceNew && frozen != null && frozen != fingerprint)
                    throw new InvalidOperationException("Run details changed during an attempt. Reset LiveSplit to resume tracking in the new category.");
                bool fresh = forceNew || identity != fingerprint || (lastPhase != phase && (idle || lastPhase == "NotRunning"));
                if (fresh) { id = Guid.NewGuid().ToString(); sequence = 0; identity = fingerprint; frozen = idle ? null : fingerprint; }
                var snapshot = Protocol.Capture(state, profile, id, sequence + 1, options.Practice, suppressNext || first);
                if (!options.Practice && (first || fresh || ((idle || state.CurrentPhase == TimerPhase.Ended) && (transition || (DateTime.UtcNow - lastRecords).TotalSeconds >= 60))))
                {
                    snapshot.records = Protocol.ReadRecords(state.Run, profile.timing=="GameTime"?TimingMethod.GameTime:TimingMethod.RealTime);
                    if(snapshot.realTime!=null) snapshot.realTime.records=Protocol.ReadRecords(state.Run,TimingMethod.RealTime);
                    lastRecords = DateTime.UtcNow;
                }
                snapshot.autosplitNames = autosplitNames;
                snapshot.manualNames = hasManual ? state.Run.Select(segment=> { var row=options.Aliases.FirstOrDefault(r=>r.Map==detected.Map && Detector.Normalize(r.Source)==Detector.Normalize(segment.Name)); return row==null?null:row.Target; }).ToArray() : null;
                snapshot.resetEvent = resetEvent;
                uploader.Enqueue(snapshot);
                sequence++; first = false; forceNew = false; suppressNext = false; lastPhase = phase; lastHeartbeat = DateTime.UtcNow;
                runtime.Run=state.Run; runtime.Config=json.Serialize(options); runtime.Id=id; runtime.Identity=identity; runtime.LastPhase=lastPhase; runtime.Frozen=frozen;
                runtime.Sequence=sequence; runtime.First=first; runtime.ForceNew=forceNew; runtime.SuppressNext=suppressNext;
                panel.StatusText = uploader.Status + " / " + uploader.Count + " pending / " + phase + " / " + bridgeStatus;
            }
            catch (Exception ex) {
                panel.StatusText = "Not uploading: " + ex.Message;
            }
        }
        void Apply(AddonOptions value)
        {
            if (json.Serialize(value) == json.Serialize(options)) return;
            if (state.CurrentPhase == TimerPhase.Running || state.CurrentPhase == TimerPhase.Paused)
                throw new InvalidOperationException("Reset or finish the run before changing addon settings.");
            Configure(value);
        }
        void Configure(AddonOptions value)
        {
            if (json.Serialize(value) == json.Serialize(options)) return;
            UploadQueue.ValidateServer(value.Server);
            value.Aliases = ManualAliases.Validate(value.Aliases);
            if (uploader != null) { uploader.Dispose(); uploader = null; }
            options = value;
            forceNew = true; first = true; suppressNext = true; frozen = null;
        }
        void EnsureUploader()
        {
            if (!activated || !options.Enabled || uploader != null) return;
            uploader = new UploadQueue(options.Server, options.Token,
#if TESTING
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ZombiesTracker-Tests"));
#else
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ZombiesTracker", "LiveSplit"));
#endif
        }
        void ClearQueue()
        {
            if (state.CurrentPhase != TimerPhase.NotRunning) throw new InvalidOperationException("Reset LiveSplit before clearing queued uploads.");
            if (uploader != null) uploader.Clear();
            forceNew = true;
        }
        public override Control GetSettingsControl(LayoutMode mode) { RefreshRunContext(); return panel; }
        // LiveSplit polls this during rendering. Do not apply UI edits, encrypt a
        // key, or change runtime state from its layout-change detection path.
        public int GetSettingsHashCode() { return (json.Serialize(options) + "|" + panel.AliasMap).GetHashCode(); }
        public override XmlNode GetSettings(XmlDocument doc)
        {
            // LiveSplit serializes/clones components while editing layouts. Never start
            // a network connection or allow encryption errors to escape into its editor.
            try { Apply(panel.ReadOptions()); }
            catch (Exception ex) { panel.StatusText = "Settings not applied: " + ex.Message; panel.LoadOptions(options); }
            var root = doc.CreateElement("Settings");
            Action<string,string> put = (key, val) => { var node = doc.CreateElement(key); node.InnerText = val; root.AppendChild(node); };
            bool canSave = true;
            try {
                // DPAPI uses random ciphertext. Re-encrypt only when the key changes;
                // otherwise LiveSplit's XML fallback hash sees a new layout every frame.
                if (protectedTokenFor != options.Token) {
                    protectedToken = options.Token.Length == 0 ? "" : Convert.ToBase64String(Protection.Protect(Encoding.UTF8.GetBytes(options.Token)));
                    protectedTokenFor = options.Token;
                }
            }
            catch (Exception ex) { canSave = false; panel.StatusText = "Cannot save key: " + ex.Message; }
            put("Version", AddonUpdates.InstalledVersion); put("Enabled", (options.Enabled && canSave).ToString()); put("Server", options.Server);
            put("ProtectedToken", protectedToken);
            put("SplitAliases", json.Serialize(options.Aliases));
            put("AliasEditorMap", panel.AliasMap);
            put("Game", options.Game); put("Map", options.Map); put("Category", options.Category); put("Practice", options.Practice.ToString());
            return root;
        }
        public override void SetSettings(XmlNode root)
        {
            Func<string,string,string> read = (key, fallback) => root[key] == null ? fallback : root[key].InnerText;
            var value = new AddonOptions { Enabled = read("Enabled", "False") == "True", Server = read("Server", "https://doctormonty.beer"),
                Game = new[]{"bo3","bo2"}.Contains(read("Game", "")) ? read("Game", "") : "", Map = read("Map", ""), Category = read("Category", ""), Practice = read("Practice", "False") == "True" };
            try
            {
                value.Aliases = ManualAliases.Validate(json.Deserialize<List<SplitLink>>(read("SplitAliases", "[]")));
                string encrypted = read("ProtectedToken", "");
                value.Token = encrypted == "" ? "" : Encoding.UTF8.GetString(Protection.Unprotect(Convert.FromBase64String(encrypted)));
                protectedToken = encrypted;
                protectedTokenFor = value.Token;
                Configure(value);
            }
            catch (Exception ex) { value.Enabled = false; options = value; panel.StatusText = "Settings need attention: " + ex.Message; }
            RefreshRunContext();
            panel.LoadOptions(value);
            panel.RestoreAliasMap(read("AliasEditorMap", ""));
        }
        public override void Update(IInvalidator invalidator, LiveSplitState state, float width, float height, LayoutMode mode)
        {
            Activate();
        }
        void Activate()
        {
            if (disposed || !InCurrentLayout()) return;
            // Only components used by the real layout get Update. Editor clones stay inert.
            if (activated && runtime.Owner == this) return;
            if (runtime.Owner != null && runtime.Owner != this && !runtime.Owner.disposed && runtime.Owner.InCurrentLayout()) {
                panel.StatusText = "Another Zombies Tracker component is already active in this layout. Keep only one.";
                return;
            }
            activated = true;
            if(ReferenceEquals(runtime.Run,state.Run) && runtime.Config == json.Serialize(options))
            {
                id=runtime.Id; identity=runtime.Identity; lastPhase=runtime.LastPhase; frozen=runtime.Frozen;
                sequence=runtime.Sequence; first=runtime.First; forceNew=runtime.ForceNew; suppressNext=runtime.SuppressNext;
                if(runtime.Owner!=null && !runtime.Owner.disposed) { uploader=runtime.Owner.uploader; runtime.Owner.uploader=null; }
            }
            if (runtime.Owner != null && runtime.Owner != this) runtime.Owner.Deactivate();
            runtime.Owner=this;
            try { EnsureUploader(); } catch (Exception ex) { panel.StatusText = "Connection waiting: " + ex.Message; }
        }
        bool InCurrentLayout()
        {
            return state.Layout != null && state.Layout.LayoutComponents.Any(c => ReferenceEquals(c.Component, this));
        }
        void Deactivate()
        {
            activated = false;
            if (runtime.Owner == this) runtime.Owner = null;
            if (uploader != null) { var previous = uploader; uploader = null; previous.Dispose(); }
        }
        public override void Dispose()
        {
            if (disposed) return;
            disposed = true; timer.Stop(); timer.Dispose();
            state.OnStart -= Started; state.OnSplit -= Changed; state.OnUndoSplit -= Changed; state.OnSkipSplit -= Changed;
            state.OnPause -= Changed; state.OnResume -= Changed; state.OnUndoAllPauses -= Changed; state.OnReset -= Reset;
            Deactivate(); updates.Dispose(); panel.Dispose();
        }
    }
    public sealed class SettingsPanel : UserControl
    {
        readonly CheckBox enabled = new CheckBox { Text = "Enable upload to Zombies Tracker", AutoSize = true };
        readonly TextBox server = new TextBox { Text = "https://doctormonty.beer" };
        readonly TextBox token = new TextBox { UseSystemPasswordChar = true };
        readonly ComboBox map = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
        readonly ComboBox game = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
        readonly ComboBox category = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
        readonly AliasEditor aliasEditor = new AliasEditor();
        string detectedMap, detectedGame = "";
        bool loadingOptions, refreshingMaps, hasRunContext;
        public string AliasMap { get { return aliasEditor.SelectedMap; } }
        public void RestoreAliasMap(string map) { aliasEditor.RestoreMap(map); }
        readonly CheckBox practice = new CheckBox { Text = "Practice (excluded from records and alerts)", AutoSize = true };
        readonly Label detection = new Label { AutoSize = true, MaximumSize = new Size(450, 0) };
        readonly Label status = new Label { Text = "Waiting for this component to become active. Close settings with OK to use this layout.", AutoSize = true, MaximumSize = new Size(450, 0) };
        readonly Label updateStatus = new Label { AutoSize = true, MaximumSize = new Size(450, 0) };
        public string UpdateText { set { updateStatus.Text = value; } }
        public string DetectionText { set { detection.Text = value; } }
        public string StatusText { set { status.Text = value; } }
        public SettingsPanel(Action<AddonOptions> apply, Action clear)
        {
            Width = 490; Height = 670; AutoScroll = true;
            var table = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1, Padding = new Padding(10) };
            Controls.Add(table);
            Action<Control> add = control => { control.Margin = new Padding(3, 4, 3, 4); control.Width = 450; table.Controls.Add(control); };
            add(new Label { Text = "BO2 / BO3 Solo Easter Egg - IGT / RTA", AutoSize = true });
            add(updateStatus);
            var updateLink = new LinkLabel { Text = "Download latest addon (close LiveSplit before installing)", AutoSize = true };
            updateLink.LinkClicked += delegate { Try(delegate { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(AddonUpdates.DownloadUrl) { UseShellExecute = true }); }); };
            add(updateLink);
            add(enabled); add(new Label { Text = "Tracker server", AutoSize = true }); add(server);
            add(new Label { Text = "Private runner key (encrypted for this Windows account)", AutoSize = true }); add(token);
            add(new Label { Text = "Game", AutoSize = true }); game.Items.AddRange(new[]{"Automatic detection", "Black Ops III Zombies", "Black Ops II Zombies"}); game.SelectedIndex = 0; add(game);
            add(new Label { Text = "Map", AutoSize = true }); map.Items.Add("Automatic detection"); foreach (var m in Detector.Maps.Where(m => m.Enabled)) map.Items.Add(m); map.SelectedIndex = 0; add(map);
            add(new Label { Text = "Category", AutoSize = true }); category.Items.Add("Automatic detection"); category.SelectedIndex = 0; add(category);
            map.SelectedIndexChanged += delegate { if(!refreshingMaps)RefreshCategories(); };
            game.SelectedIndexChanged += delegate { if(!loadingOptions)RefreshMaps(); };
            add(practice);
            add(aliasEditor);
            add(new Label {Text="Aliases change tracker labels only. Finish or reset, Apply, then save your layout. For Super EE choose map-prefixed splits and a Complete marker for each map.",AutoSize=true,MaximumSize=new Size(450,0)});
            var import = new Button { Text = "Import downloaded config.json", AutoSize = true };
            import.Click += delegate {
                using (var dialog = new OpenFileDialog { Filter = "Tracker configuration|*.json" })
                    if (dialog.ShowDialog() == DialogResult.OK) Try(delegate {
                        var data = new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(dialog.FileName));
                        server.Text = Convert.ToString(data["server"]); token.Text = Convert.ToString(data["token"]);
                        // Imports identity, not a forced map: detection remains the default.
                        game.SelectedIndex = 0; map.SelectedIndex = 0; category.SelectedIndex = 0; enabled.Checked = false;
                        status.Text = "Imported. Stop the old companion, enable upload, then Apply. Select Direct LiveSplit on the website.";
                    });
            }; add(import);
            var button = new Button { Text = "Apply settings", AutoSize = true };
            button.Click += delegate { Try(delegate {
                apply(ReadOptions());
            }); }; add(button);
            add(detection); add(status);
            var clearButton = new Button { Text = "Discard pending uploads...", AutoSize = true };
            clearButton.Click += delegate {
                if (MessageBox.Show("Discard unsent run updates? This cannot be undone.", "Zombies Tracker", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes) Try(clear);
            }; add(clearButton);
            add(new Label { Text = "Save your LiveSplit layout after Apply. Add this component only once. Never run the old companion at the same time.", AutoSize = true, MaximumSize = new Size(450, 0) });
        }
        void Try(Action action) { try { action(); } catch (Exception ex) { status.Text = ex.Message; } }
        public void FollowRun(string mapId, string gameId)
        {
            if(hasRunContext && detectedMap==mapId && detectedGame==gameId)return;

            aliasEditor.Read();
            detectedMap=mapId; detectedGame=gameId; hasRunContext=true;
            RefreshMaps();
            aliasEditor.FollowMap(!string.IsNullOrEmpty(mapId) && Detector.IsBo2(mapId)==(SelectedGame=="bo2")?mapId:null);
        }
        string SelectedGame { get { return game.SelectedIndex==1?"bo3":game.SelectedIndex==2?"bo2":detectedGame; } }
        void RefreshMaps()
        {
            string previous=map.SelectedItem is MapInfo?((MapInfo)map.SelectedItem).Id:"";
            refreshingMaps=true;
            map.Items.Clear();map.Items.Add("Automatic detection");
            foreach(var m in Detector.Maps.Where(m=>m.Enabled && (SelectedGame=="" || Detector.IsBo2(m.Id)==(SelectedGame=="bo2"))))map.Items.Add(m);
            map.SelectedIndex=0;
            foreach(var item in map.Items)if(item is MapInfo && ((MapInfo)item).Id==previous)map.SelectedItem=item;
            refreshingMaps=false;
            aliasEditor.FilterGame(SelectedGame);
            RefreshCategories();
        }
        void RefreshCategories()
        {
            string previous = category.SelectedItem as string;
            string selectedMap = map.SelectedItem is MapInfo ? ((MapInfo)map.SelectedItem).Id : detectedMap;
            if(!string.IsNullOrEmpty(selectedMap) && SelectedGame!="" && Detector.IsBo2(selectedMap)!=(SelectedGame=="bo2"))selectedMap=null;
            category.Items.Clear(); category.Items.Add("Automatic detection");
            category.Items.AddRange(!string.IsNullOrEmpty(selectedMap)?Detector.CategoriesForMap(selectedMap):SelectedGame=="bo2"?Detector.Bo2Categories:SelectedGame=="bo3"?Detector.Categories:new string[0]);
            category.SelectedIndex = Math.Max(0, category.Items.IndexOf(previous ?? ""));
            aliasEditor.FollowMap(selectedMap);
        }
        public AddonOptions ReadOptions()
        {
            return new AddonOptions { Enabled = enabled.Checked, Server = server.Text.Trim(), Token = token.Text.Trim(),
                Game = game.SelectedIndex == 1 ? "bo3" : game.SelectedIndex == 2 ? "bo2" : "",
                Map = map.SelectedItem is MapInfo ? ((MapInfo)map.SelectedItem).Id : "", Category = category.SelectedIndex > 0 ? (string)category.SelectedItem : "",
                Practice = practice.Checked, Aliases = aliasEditor.Read() };
        }
        public void LoadOptions(AddonOptions value)
        {
            hasRunContext=false;
            aliasEditor.LoadLinks(value.Aliases);
            loadingOptions=true;
            game.SelectedIndex = value.Game == "bo3" ? 1 : value.Game == "bo2" ? 2 : 0;
            loadingOptions=false;
            RefreshMaps();
            enabled.Checked = value.Enabled; server.Text = value.Server; token.Text = value.Token; practice.Checked = value.Practice;
            map.SelectedIndex = 0; foreach (var item in map.Items) if (item is MapInfo && ((MapInfo)item).Id == value.Map) map.SelectedItem = item;
            category.SelectedIndex = Math.Max(0, category.Items.IndexOf(value.Category));
        }
    }
}


