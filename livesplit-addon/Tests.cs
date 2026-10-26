using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Net;
using System.Net.Http;
using System.Windows.Forms;
using System.Xml;
using LiveSplit.Model;
using LiveSplit.ZombiesTracker;

class Tests
{
    sealed class DelayedUpload : HttpMessageHandler {
        public readonly TaskCompletionSource<HttpResponseMessage> Response = new TaskCompletionSource<HttpResponseMessage>();
        public readonly ManualResetEvent Started = new ManualResetEvent(false);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
            Started.Set(); return Response.Task; // Deliberately ignores cancellation.
        }
    }
    static void UseLayout(LiveSplitState state, TrackerComponent component) {
        state.Layout = new LiveSplit.UI.Layout { Settings=new LiveSplit.Options.SettingsFactories.StandardLayoutSettingsFactory().Create() };
        if(component!=null)state.Layout.LayoutComponents.Add(new LiveSplit.UI.Components.LayoutComponent("LiveSplit.ZombiesTracker.dll",component));
    }
    static int assertions;
    static T Field<T>(object instance,string name) { return (T)instance.GetType().GetField(name,BindingFlags.Instance|BindingFlags.NonPublic).GetValue(instance); }
    static void Check(bool condition, string name) { assertions++; if (!condition) throw new Exception("FAIL: " + name); }
    static Detection Detect(string title, params string[] names)
    { return Detector.Detect("Call of Duty: Black Ops III", title, "", new Dictionary<string,string>(), names, ""); }
    static void Pump(int ms) { var until = DateTime.UtcNow.AddMilliseconds(ms); while (DateTime.UtcNow < until) { Application.DoEvents(); Thread.Sleep(10); } }
    [STAThread] static int Main(string[] args)
    {
        try
        {
            foreach(var iwMap in Detector.Maps.Where(m=>Detector.IsIW(m.Id))) {
                Check(Detector.Detect("Call of Duty: Infinite Warfare Zombies",iwMap.Name,"",new Dictionary<string,string>(),new[]{"Custom split","End"},"").Map==iwMap.Id,"IW map "+iwMap.Id);
                Check(Detector.Detect(iwMap.Aliases[0],"FF","",new Dictionary<string,string>(),new string[0],"").Map==iwMap.Id,"IW map title "+iwMap.Id);
                Check(Detector.UsesIGT(iwMap.Id),"IW uses IGT");
            }
            foreach(var category in Detector.IWCategories)Check(Detector.IWCategory(new[]{category},"")==category,"IW category "+category);
            Check(Detector.IWCategory(new[]{"Directors Cut (Fate & Fortune Cards)"},"")=="DC FF","IW full category");
            Check(Detector.IWCategory(new[]{"Fate Cards Only","Fate & Fortune"},"")==null,"IW conflicting cards blocked");
            Check(Detector.Detect("IW","Spaceland 2P","",new Dictionary<string,string>(),new string[0],"").NonSolo,"IW coop blocked");
            Check(!Detector.Detect("BO3","Spaceland","",new Dictionary<string,string>(),new string[0],"iw-spaceland").Success,"IW cannot relabel BO3");
            bool productionBlocked=false;try{UploadQueue.ValidateServer("https://doctormonty.beer");}catch{productionBlocked=true;}Check(!productionBlocked,"release accepts production server");
            foreach(var iwMap in Detector.Maps.Where(m=>Detector.IsIW(m.Id))) {
                var targets=ManualAliases.Targets(iwMap.Id);
                Check(targets.Length>=5 && targets.Last()==(iwMap.Id=="iw-mephistopheles-super"?"Mephistopheles":"End"),"IW alias targets "+iwMap.Id);
                Check(SplitAliases.Known(iwMap.Id,targets[0].ToLowerInvariant())==targets[0],"IW canonical spelling");
                var links=new[]{new SplitLink{Map=iwMap.Id,Source="Custom name",Target=targets[0]}};
                Check(ManualAliases.Resolve(links,iwMap.Id,new[]{"Custom name","Unmapped"},null)[0]==targets[0],"IW manual alias");
                using(var editor=new AliasEditor()){editor.FilterGame("iw");editor.FollowMap(iwMap.Id);var choices=Field<ComboBox>(editor,"maps");Check(choices.Items.Count==6 && editor.SelectedMap==iwMap.Id,"IW map selector retains map");}
            }
            Check(ManualAliases.Targets("iw-rave-in-the-redwoods").SequenceEqual(new[]{"Boat 1","Zipline","Boat 2","Boss Enter","Boss Phase 1","Boss Phase 2","End"}),"Rave exact order including Death Reset");
            using(var editor=new AliasEditor()) {
                editor.FilterGame("iw");editor.FollowMap("iw-spaceland");editor.SetCategory("DC FF");
                var grid=Field<DataGridView>(editor,"grid");var options=((DataGridViewComboBoxColumn)grid.Columns[1]).Items;
                Check(!options.Contains("Round 9 End"),"DC Spaceland hides round 9");editor.SetCategory("Fate");Check(options.Contains("Round 9 End"),"Fate Spaceland includes round 9");
                editor.FollowMap("iw-attack-of-the-radioactive-thing");Check(!options.Contains("Death Reset"),"Fate Attack hides death reset");editor.SetCategory("DC Fate");Check(options.Contains("Death Reset"),"DC Attack includes death reset");
            }
            Check(Detector.CategoriesForMap("iw-mephistopheles-super").SequenceEqual(new[]{"DC Fate","DC FF"}),"Super DC categories only");
            Check(Detector.IWCategory(new[]{"DCFF"},"")=="DC FF" && Detector.IWCategory(new[]{"DCFate"},"")=="DC Fate","compact DC categories");
            Check(Detector.CategoriesForMap("bo2-victis-super").SequenceEqual(new[]{"Richtofen","Maxis"}),"Victis has no Bank categories");
            Check(ManualAliases.Targets("bo2-victis-super").SequenceEqual(new[]{"Tranzit","Die Rise","Buried"}),"Victis ordered map completions");
            foreach(var side in new[]{"Richtofen","Maxis"}) {
                Check(Detector.Detect("Black Ops II Zombies","Victis Super "+side,"",new Dictionary<string,string>(),new[]{"Tranzit","Die Rise","Buried"},"").Map=="bo2-victis-super","Victis detection "+side);
                Check(Detector.Bo2Category(new[]{side},"","bo2-victis-super")==side,"Victis side "+side);
            }
            Check(Detector.Bo2Category(new[]{"Richtofen Maxis"},"","bo2-victis-super")==null,"Victis conflicting sides blocked");
            using(var panel=new SettingsPanel(o=>{},()=>{})) {
                var games=Field<ComboBox>(panel,"game");var maps=Field<ComboBox>(panel,"map");var cats=Field<ComboBox>(panel,"category");var editor=Field<AliasEditor>(panel,"aliasEditor");var aliases=Field<ComboBox>(editor,"maps");
                Check(maps.Items.Count==1 && aliases.Items.Count==0,"unknown game shows no mixed map lists");
                foreach(var gameId in new[]{"bo3","bo2","iw"}) {
                    games.SelectedIndex=gameId=="bo3"?1:gameId=="bo2"?2:3;
                    Check(maps.Items.OfType<MapInfo>().All(m=>Detector.GameForMap(m.Id)==gameId),"map selector game isolation "+gameId);
                    Check(aliases.Items.Cast<MapInfo>().All(m=>Detector.GameForMap(m.Id)==gameId),"alias selector game isolation "+gameId);
                    foreach(var entry in maps.Items.OfType<MapInfo>().ToArray()) {
                        maps.SelectedItem=entry;
                        Check(cats.Items.Cast<string>().Skip(1).SequenceEqual(Detector.CategoriesForMap(entry.Id)),"category list scoped "+entry.Id);
                        Check(panel.AliasMap==entry.Id,"alias follows selected map "+entry.Id);
                        foreach(var cat in Detector.CategoriesForMap(entry.Id)){cats.SelectedItem=cat;var grid=Field<DataGridView>(editor,"grid");Check(((DataGridViewComboBoxColumn)grid.Columns[1]).Items.Cast<string>().SequenceEqual(ManualAliases.Targets(entry.Id,cat)),"split list scoped "+entry.Id+" "+cat);}
                    }
                }
                panel.RestoreAliasMap("der-eisendrache");Check(Detector.GameForMap(panel.AliasMap)=="iw","old layout cannot restore another game's alias map");
            }
            using(var editor=new AliasEditor()) {
                editor.LoadLinks(new[]{new SplitLink{Map="iw-spaceland",Source="My round",Target="Round 9 End"},new SplitLink{Map="der-eisendrache",Source="My rocket",Target="Rocket"}});
                editor.FilterGame("iw");editor.FollowMap("iw-spaceland");editor.SetCategory("DC FF");
                var grid=Field<DataGridView>(editor,"grid");Check(grid.Rows.Count==1 && editor.Read().Count==2,"category-incompatible alias hidden but retained");
                editor.SetCategory("Fate");Check(grid.Rows.Count==2 && Convert.ToString(grid.Rows[0].Cells[1].Value)=="Round 9 End","hidden category alias restored");
                editor.FilterGame("bo2");editor.RestoreMap("iw-spaceland");Check(editor.SelectedMap=="" && editor.Read().Count==2,"game switch retains saved aliases without cross-game restore");
            }
            var factory = new Factory();
            Check(factory.Version == new Version(AddonUpdates.InstalledVersion), "factory and upload versions agree");
            Check(factory.XMLURL == factory.UpdateURL + "update.LiveSplit.ZombiesTracker.xml", "production updater manifest URL");
            Check(AddonUpdates.DownloadUrl=="https://doctormonty.beer/downloads/Zombies-Tracker-LiveSplit.zip","production addon download URL");
            var manifest = new XmlDocument();
            manifest.Load(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "release.xml"));
            var release = UpdateManager.Update.Parse(manifest.DocumentElement.FirstChild);
            Check(release.Version == factory.Version, "LiveSplit parses release manifest version");
            Check(release.FileChanges.Count == 1 && release.FileChanges[0].Path == "Components/LiveSplit.ZombiesTracker.dll" && release.FileChanges[0].Status == UpdateManager.ChangeStatus.Changed, "updater replaces only tracker DLL");
            var aliasRows=new[]{new SplitLink{Map="der-eisendrache",Source="My split",Target="Rocket"},new SplitLink{Map="revelations",Source="My split",Target="Exit"}};
            Check(ManualAliases.Resolve(aliasRows,"der-eisendrache",new[]{"My split","R7"},new[]{"Bow","Crackle"})[0]=="Rocket","manual alias overrides autosplitter");
            Check(ManualAliases.Resolve(aliasRows,"der-eisendrache",new[]{"My split","R7"},new[]{"Bow","Crackle"})[1]=="Crackle","unmapped split retains automatic hint");
            Check(ManualAliases.Resolve(aliasRows,"revelations",new[]{"My split"},null)[0]=="Beast Exit","aliases are map scoped");
            Check(ManualAliases.Targets("revelations").Contains("Beast Enter") && !ManualAliases.Targets("revelations").Contains("Beast"),"new Revelations dropdown labels");
            Check(ManualAliases.Validate(new[]{new SplitLink{Map="super-easter-egg",Source="Custom",Target="Revelations - Exit"}})[0].Target=="Revelations - Beast Exit","legacy Super EE alias preserved");
            Check(!ManualAliases.Targets("origins").Contains("Fire Dupe"),"removed milestones stay removed");
            Check(ManualAliases.Targets("super-easter-egg").Contains("Der Eisendrache - Rocket"),"Super EE has map-prefixed checkpoints");
            var superLinks=ManualAliases.Core.Select((id,i)=>new SplitLink{Map="super-easter-egg",Source="Custom "+i,Target=Detector.Maps.First(m=>m.Id==id).Name+" - Complete"}).ToArray();
            Check(Detector.Detect("Super Easter Egg","","",new Dictionary<string,string>(),superLinks.Select(r=>r.Source),"",superLinks).Success,"custom Super EE completion aliases pass detection");
            bool collision=false;try{ManualAliases.Resolve(aliasRows,"der-eisendrache",new[]{"My split","Rocket"},null);}catch{collision=true;}Check(collision,"duplicate mapped checkpoints blocked");
            using(var editor=new AliasEditor()){editor.LoadLinks(aliasRows);Check(editor.Read().Count==2,"alias editor roundtrip retains every map");}
            using(var panel=new SettingsPanel(o=>{},()=>{})) {
                panel.LoadOptions(new AddonOptions{Aliases=ManualAliases.Validate(aliasRows)});
                panel.FollowRun("der-eisendrache","bo3");
                var editor=Field<AliasEditor>(panel,"aliasEditor");var grid=Field<DataGridView>(editor,"grid");
                var categories=Field<ComboBox>(panel,"category");var games=Field<ComboBox>(panel,"game");
                Check(panel.AliasMap=="der-eisendrache" && Convert.ToString(grid.Rows[0].Cells[1].Value)=="Rocket","detected DE shows existing aliases");
                grid.Rows.Add("New DE split","Bow");
                panel.FollowRun("shadows-of-evil","bo3");
                Check(grid.Rows.Cast<DataGridViewRow>().All(r=>r.IsNewRow),"new SOE map has blank aliases");
                grid.Rows.Add("My split",ManualAliases.Targets("shadows-of-evil")[0]);
                panel.FollowRun("der-eisendrache","bo3");
                Check(grid.Rows.Count==3 && panel.ReadOptions().Aliases.Count==4,"switching back saves edits without replacing other maps");
                panel.FollowRun("bo2-tranzit","bo2");
                Check(!categories.Items.Contains("Mega Gums") && categories.Items.Contains("Bank Richtofen"),"automatic BO2 excludes BO3 categories");
                panel.FollowRun("bo2-origins","bo2");
                Check(categories.Items.Count==2 && categories.Items.Contains("Standard"),"automatic BO2 map filters categories");
                panel.FollowRun("shadows-of-evil","bo3");
                Check(grid.Rows.Count==2 && !categories.Items.Contains("Bank Richtofen"),"SOE aliases restored and BO2 categories removed");
                panel.FollowRun(null,"");
                Check(!grid.Enabled && panel.ReadOptions().Aliases.Count==4,"unknown run hides aliases without deleting them");
                games.SelectedIndex=2;
                Check(categories.Items.Contains("Bank Richtofen") && !categories.Items.Contains("Mega Gums"),"explicit game filters automatic-map categories");
                panel.FollowRun("der-eisendrache","bo3");
                Check(panel.AliasMap=="","conflicting game hides split aliases");
                games.SelectedIndex=0;
                panel.FollowRun("der-eisendrache","bo3");
                grid.Rows.Add("Unfinished",null);
                bool blocked=false;try{panel.FollowRun("revelations","bo3");}catch(InvalidOperationException){blocked=true;}
                Check(blocked && panel.AliasMap=="der-eisendrache" && grid.Rows.Count==4,"unfinished edits are retained on automatic switch");
            }
            var followState=new LiveSplitState(new Run(new LiveSplit.Model.Comparisons.StandardComparisonGeneratorsFactory()){GameName="Call of Duty: Black Ops III",CategoryName="DE Mega Gums"},null,null,null,null);
            using(var component=new TrackerComponent(followState)) {
                var panel=(SettingsPanel)component.GetSettingsControl(LiveSplit.UI.LayoutMode.Vertical);
                Check(panel.AliasMap=="der-eisendrache","settings detects loaded DE splits with upload disabled");
                followState.Run=new Run(new LiveSplit.Model.Comparisons.StandardComparisonGeneratorsFactory()){GameName="Call of Duty: Black Ops III",CategoryName="SOE Any%"};
                Pump(1200);
                Check(panel.AliasMap=="shadows-of-evil","timer automatically follows replacement splits without reopening settings");
                followState.Run=new Run(new LiveSplit.Model.Comparisons.StandardComparisonGeneratorsFactory()){GameName="Call of Duty: Black Ops II",CategoryName="Origins"};
                Pump(1200);
                Check(panel.AliasMap=="bo2-origins" && Field<ComboBox>(panel,"category").Items.Contains("Standard"),"timer follows game and category changes");
            }
            Check(AddonUpdates.Describe("0.2.8","0.2.9","0.2.7").Contains("is available"),"optional update notice");
            Check(AddonUpdates.Describe("0.2.6","0.2.9","0.2.7").Contains("Important update"),"important update notice");
            Check(AddonUpdates.Describe("0.2.10","0.2.9","0.2.7").Contains("up to date"),"numeric version ordering");
            bool invalidRelease=false;try{AddonUpdates.Describe("0.2.8","bad","0.2.7");}catch{invalidRelease=true;}Check(invalidRelease,"invalid manifest rejected");
            foreach(var map in Detector.Maps.Where(m=>m.Enabled&&Detector.GameForMap(m.Id)=="bo3"&&m.Id!="super-easter-egg"))
                Check(Detector.Detect(map.Name,"","",new Dictionary<string,string>(),new string[0],"").Map==map.Id,"map-only title "+map.Id);
            Check(Detector.RunCategory("","","der-eisendrache")=="Mega Gums","empty category defaults Mega");
            Check(Detector.RunCategory("","","ascension")=="Any%","Any only category default");
            Check(Detector.RunCategory("No Gums Mega Gums","","der-eisendrache")==null,"conflict not defaulted");
            Check(Detector.RunCategory("Zetsubou no Shima","","zetsubou-no-shima")=="Mega Gums","map-only category defaults Mega");
            foreach (var game in new[]{"Black Ops III Zombies","Call of Duty: Black Ops III Zombies","BO3 Zombies"})
                Check(Detector.Detect(game,"DE","",new Dictionary<string,string>(),new string[0],"").Success,"Zombies game title " + game);
            Check(Detector.Detect("","DE","",new Dictionary<string,string>(),new string[0],"",null,"bo3").Success,"explicit BO3 permits blank game title");
            Check(!Detector.Detect("Black Ops II Zombies","Origins","",new Dictionary<string,string>(),new string[0],"",null,"bo3").Success,"explicit BO3 cannot relabel BO2");
            Check(!Detector.Detect("BO3","DE","",new Dictionary<string,string>{{"Speedrun Type","High Round"}},new string[0],"").Success,"unsupported speedrun type blocked");
            Check(Detector.Detect("BO3","","",new Dictionary<string,string>{{"Map","DE"},{"Speedrun Type","Easter Egg"}},new string[0],"").Success,"map and speedrun metadata");
            foreach(var map in Detector.Maps.Where(m=>m.Enabled&&Detector.GameForMap(m.Id)=="bo3")) {
                var defaultCategory=Detector.CategoriesForMap(map.Id).Contains("Mega Gums")?"Mega Gums":"Any%";
                Check(Detector.RunCategory(map.Name,"",map.Id)==defaultCategory,"map-only default "+map.Id);
                Check(Detector.MetadataCategory(map.Name,new Dictionary<string,string>{{"Category","Easter Egg"},{"Gobblegum Loadout",""}},"",map.Id)==defaultCategory,"EE blank loadout "+map.Id);
                foreach(var loadout in new[]{"","Megas","Classics","No Gums"})
                    Check(Detector.MetadataCategory(map.Name,new Dictionary<string,string>{{"Category","Any%"},{"Gobblegum Loadout",loadout}},"",map.Id)=="Any%","Any overrides loadout "+map.Id+loadout);
            }
            Check(Detector.MetadataCategory("Zetsubou No Shima",new Dictionary<string,string>{{"Category","Easter Egg"},{"Gobblegum Loadout","Megas"}},"","zetsubou-no-shima")=="Mega Gums","screenshot EE Megas");
            Check(Detector.MetadataCategory("Der Eisendrache",new Dictionary<string,string>{{"Category","EE"},{"Gobblegum Loadout","Classics"}},"","der-eisendrache")=="Classic Gums","EE uses Classics");
            Check(Detector.MetadataCategory("Der Eisendrache",new Dictionary<string,string>{{"Category","Easter Egg"},{"Gobblegum Loadout","No Gums"}},"","der-eisendrache")=="No Gums","EE uses No Gums");
            Check(Detector.MetadataCategory("DE",new Dictionary<string,string>{{"Gum Category","Classic Gums"}},"","der-eisendrache")=="Classic Gums","gum metadata used");
            Check(Detector.MetadataCategory("Mega Gums",new Dictionary<string,string>{{"Gum Category","Classic Gums"}},"","der-eisendrache")==null,"conflicting metadata blocked");
            var settings=new XmlDocument();settings.LoadXml("<Settings><Split>True</Split><CustomSettings><Setting id='zm_castle'>True</Setting><Setting id='Bow'>False</Setting><Setting id='Rocket Test TP'>True</Setting><Setting id='First TP'>True</Setting></CustomSettings></Settings>");
            var order=new Dictionary<int,string>{{0,"Bow"},{1,"Rocket Test TP"},{2,"First TP"}};
            Check(AutosplitBridge.Select(order,settings.DocumentElement,"zm_castle",2).SequenceEqual(new[]{"Rocket Test TP","First TP"}),"selected ASL order");
            Check(AutosplitBridge.Select(order,settings.DocumentElement,"zm_castle",3)==null,"extra manual split disables index mapping");
            Check(AutosplitBridge.Select(order,settings.DocumentElement,"zm_zod",2)==null,"other map cannot borrow settings");
            Check(AutosplitBridge.Compatible("der-eisendrache",new[]{"Penguine Eats Bread","TP"},new[]{"Rocket Test TP","First TP"}),"custom names with consistent anchors");
            Check(!AutosplitBridge.Compatible("der-eisendrache",new[]{"Bow","TP"},new[]{"Rocket Test TP","First TP"}),"contradictory named anchor rejected");
            foreach (var map in Detector.Maps.Where(m => m.Enabled && Detector.GameForMap(m.Id)=="bo3" && m.Id != "super-easter-egg")) Check(Detect(map.Name + " Any% Solo").Map == map.Id, "map " + map.Name);
            Check(!Detector.CategoriesForMap("zetsubou-no-shima").Contains("No Gums"), "ZNS category restriction");
            Check(!Detector.CategoriesForMap("super-easter-egg").Contains("No Gums"), "Super EE category restriction");
            Check(Detector.CategoriesForMap("ascension").SequenceEqual(new[]{"Any%"}) && Detector.CategoriesForMap("shangri-la").SequenceEqual(new[]{"Any%"}), "Any percent only maps");
            var superSplits = new[]{"SOE - Complete", "The Giant - Complete", "DE - Bow", "DE - Complete", "ZNS - Complete", "GK - Complete", "Revelations - Complete"};
            Check(Detect("Super Easter Egg - Classic Gums - Solo", superSplits).Map == "super-easter-egg", "six map detection");
            Check(!Detect("Super EE", superSplits.Where(n => !n.StartsWith("The Giant")).ToArray()).Success, "Giant required");
            Check(Detector.ValidateSuper(superSplits.Reverse().ToArray()) != null, "Revelations must end run");
            Check(Detector.ValidateSuper(superSplits.Concat(new[]{"Bow"}).ToArray()) != null, "prefix required");
            Check(Detector.Stage("DE - Bow", false) == "der-eisendrache" && Detector.Stage("DE - Bow", true) == null, "checkpoint not completion");
            Check(Detect("DE - No Gums - Solo").Map == "der-eisendrache", "abbreviation");
            Check(!Detect("Moon + Origins").Success, "conflict");
            Check(!Detect("Kino der Toten").Success, "disabled");
            Check(!Detect("Easter Egg", "Bow", "Power", "Boss").Success, "generic splits");
            Check(Detect("Easter Egg", "Lightning Bow", "Wisps").Map == "der-eisendrache", "distinctive pair");
            Check(!Detect("Easter Egg", "Lightning Bow", "Wisps", "KT4", "Masamune").Success, "signature conflict");
            Check(Detect("Der Eisendrache Solo 2P").NonSolo, "contradictory multiplayer");
            Check(Detect("Der Eisendrache Co-op").NonSolo, "coop");
            Check(Detector.Detect("Call of Duty Black Ops II", "Origins", "", new Dictionary<string,string>(), new string[0], "").Map=="bo2-origins", "BO2 Origins isolated");
            foreach(var title in new[]{"Black Ops II Zombies","Call of Duty: Black Ops II Zombies","Black Ops 2 Zombies","BO2 Zombies","BOII Zombies"})Check(Detector.Detect(title,"Origins","",new Dictionary<string,string>(),new string[0],"").Map=="bo2-origins","BO2 title variant "+title);
            Check(Detector.Detect("Origins","Standard","",new Dictionary<string,string>(),new string[0],"",null,"bo2").Map=="bo2-origins","BO2 selector with shared map title");
            Check(Detector.Detect("TranZit","Bank Maxis","",new Dictionary<string,string>(),new string[0],"").Map=="bo2-tranzit","unique BO2 map title");
            Check(!Detector.Detect("BO2","Nuketown","",new Dictionary<string,string>(),new[]{"Power"},"").Success,"Nuketown is unsupported");
            foreach(var map in Detector.Maps.Where(m=>Detector.IsBo2(m.Id))) Check(Detector.Detect("BO2",map.Name,"",new Dictionary<string,string>(),new string[0],"").Map==map.Id,"BO2 map "+map.Id);
            Check(Detector.Bo2Category(new[]{"TranZit"},"","bo2-tranzit")=="Bank Richtofen","map-only BO2 default");
            Check(Detector.Bo2Category(new[]{"No Bank"},"","bo2-tranzit")=="No Bank Richtofen","explicit no bank preserved");
            Check(Detector.Bo2Category(new[]{"Maxis"},"","bo2-buried")=="Bank Maxis","explicit Maxis preserved");
            foreach(var map in new[]{"bo2-tranzit","bo2-die-rise","bo2-buried"}) {
                Check(Detector.Bo2Category(new[]{map,"Easter Egg","",""},"",map)=="Bank Richtofen","BO2 blank Additional Info default "+map);
                Check(Detector.Bo2Category(new[]{map,"Easter Egg","Richtofen","Bank"},"",map)=="Bank Richtofen","BO2 separate bank/side metadata "+map);
                Check(Detector.Bo2Category(new[]{"Richtofen Bank"},"",map)=="Bank Richtofen","BO2 reversed category wording "+map);
                Check(Detector.Bo2Category(new[]{map,"Easter Egg","Maxis","No Bank"},"",map)=="No Bank Maxis","BO2 explicit metadata preserved "+map);
            }
            foreach(var map in new[]{"bo2-origins","bo2-mob-of-the-dead"})
                Check(Detector.Bo2Category(new[]{map},"",map)=="Standard","BO2 non-Victis stays Standard "+map);
            foreach(var category in Detector.Bo2Categories) Check(Detector.Bo2Category(new[]{category},"","bo2-tranzit")==category,"BO2 category "+category);
            Check(Detector.Bo2Category(new[]{"No Bank Maxis","Bank Maxis"},"","bo2-buried")==null,"conflicting bank metadata rejected");
            Check(Detector.Bo2Category(new[]{"Bank Maxis Richtofen"},"","bo2-buried")==null,"ambiguous BO2 category");
            foreach (var game in new[]{"", "Call of Duty: Black Ops 4", "Call of Duty: Black Ops II", "Minecraft", "BO3 custom game"})
                foreach (var selected in new[]{"", "der-eisendrache"})
                    Check(!Detector.Detect(game, "Der Eisendrache Mega Gums", "DE", new Dictionary<string,string>(), new[]{"Lightning Bow", "Wisps"}, selected).Success, "reject unsupported game despite BO3 map hints/override: " + game);
            foreach (var game in new[]{"BO3", "Black Ops 3", "Black Ops III", "Call of Duty: Black Ops III"})
                Check(Detector.Detect(game,"DE Mega Gums","",new Dictionary<string,string>(),new string[0],"der-eisendrache").Success,"supported game with matching override: " + game);
            Check(!Detector.Detect("BO3","Dead of the Night","",new Dictionary<string,string>(),new[]{"Power","Boss"},"der-eisendrache").Success,"unknown map cannot inherit override");
            Check(!Detector.Detect("BO3","Kino der Toten","",new Dictionary<string,string>(),new string[0],"der-eisendrache").Success,"disabled map cannot inherit override");
            Check(!Detector.Detect("BO3","Origins","",new Dictionary<string,string>(),new string[0],"der-eisendrache").Success,"stale override cannot relabel supported map");
            Check(Detector.Detect("BO3", "Easter Egg", "", new Dictionary<string,string>{{"Map","Moon"}}, new string[0], "").Map == "moon", "metadata");
            Check(Detector.Detect("BO3", "Easter Egg", "Origins - Mega Gums", new Dictionary<string,string>(), new string[0], "").Map == "origins", "filename");
            foreach (var category in Detector.Categories) Check(Detector.Category(new[]{"DE " + category + " Solo"}, "") == category, "category " + category);
            Check(Detector.Category(new[]{"No Gums Mega Gums"}, "") == null, "category conflict");
            Check(Detector.Category(new[]{"any route"}, "") == null, "any without percent");
            bool rejected = false; try { UploadQueue.ValidateServer("http://example.com"); } catch { rejected = true; } Check(rejected, "https required");
            rejected = false; try { UploadQueue.ValidateServer("https://host.example/path"); } catch { rejected = true; } Check(rejected, "origin required");
            var run = new Run(new LiveSplit.Model.Comparisons.StandardComparisonGeneratorsFactory()); run.GameName = "Call of Duty: Black Ops III"; run.CategoryName = "Der Eisendrache - No Gums - Solo";
            run.Add(new Segment("Bow Done")); run.Add(new Segment("Crackle")); run.Add(new Segment("Boss"));
            var state = new LiveSplitState(run, null, null, null, null);
            run.AttemptCount = 34324;
            var countProbe = Protocol.Capture(state, new RunProfile { map="der-eisendrache", category="No Gums", players=1, timing="RealTime" }, "count-probe", 1, false, false);
            Check(countProbe.addonVersion==AddonUpdates.InstalledVersion,"snapshots report addon version");
            Check(countProbe.attemptCount == 34324 && run.AttemptCount == 34324, "saved attempt count captured without mutation");
            Check(countProbe.igtMs == null,"idle does not invent IGT");
            var model = new TimerModel { CurrentState = state };
            using(var settingsProbe=new TrackerComponent(state)) {
                var settingsDoc=new XmlDocument(); settingsDoc.LoadXml("<Settings><SplitsFolder>C:\\Splits</SplitsFolder><Enabled>False</Enabled><ProtectedToken>" + Convert.ToBase64String(Protection.Protect(Encoding.UTF8.GetBytes("synthetic-test-key"))) + "</ProtectedToken></Settings>");
                var linksNode=settingsDoc.CreateElement("SplitAliases");linksNode.InnerText=new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(aliasRows);settingsDoc.DocumentElement.AppendChild(linksNode);
                settingsProbe.SetSettings(settingsDoc.DocumentElement);
                var settingsPanel=(SettingsPanel)settingsProbe.GetSettingsControl(LiveSplit.UI.LayoutMode.Vertical);
                var gameOptions=settingsPanel.ReadOptions(); gameOptions.Game="bo3"; settingsPanel.LoadOptions(gameOptions);
                settingsPanel.RestoreAliasMap("der-eisendrache");
                var selectionXml=settingsProbe.GetSettings(new XmlDocument());
                Check(selectionXml["SplitsFolder"].InnerText==@"C:\Splits","PB folder survives layout settings");
                Check(selectionXml["AliasEditorMap"].InnerText=="der-eisendrache","alias editor selection saved in layout");
                Check(selectionXml["Game"].InnerText=="bo3","game selection saved in layout");
                using(var reopened=new TrackerComponent(state)) {
                    reopened.SetSettings(selectionXml);
                    var reopenedPanel=(SettingsPanel)reopened.GetSettingsControl(LiveSplit.UI.LayoutMode.Vertical);
                    Check(reopenedPanel.ReadOptions().Game=="bo3","game selection restored in replacement layout");
                    Check(reopenedPanel.AliasMap=="der-eisendrache","alias selection restored in replacement layout");
                    reopenedPanel.RestoreAliasMap("super-easter-egg");
                    Check(settingsPanel.AliasMap=="der-eisendrache","alias selection stays separate between layouts");
                    reopened.SetSettings(selectionXml);
                    Check(reopenedPanel.AliasMap=="der-eisendrache","switching back restores saved map rather than Super EE");
                    Check(reopened.GetSettings(new XmlDocument())["SplitAliases"].InnerText==selectionXml["SplitAliases"].InnerText,"restoring selection preserves aliases");
                }
                Check(settingsProbe.GetSettings(new XmlDocument())["SplitAliases"].InnerText.Contains("Rocket"),"manual aliases survive settings XML");
                string saved=settingsProbe.GetSettings(new XmlDocument()).OuterXml;
                Check(saved==settingsProbe.GetSettings(new XmlDocument()).OuterXml, "unchanged settings keep identical encrypted XML across render checks");
                settingsProbe.SetSettings(settingsProbe.GetSettings(new XmlDocument()));
                Check(saved==settingsProbe.GetSettings(new XmlDocument()).OuterXml, "layout settings roundtrip preserves encrypted XML");
                var layout=new LiveSplit.UI.Layout { Settings=new LiveSplit.Options.SettingsFactories.StandardLayoutSettingsFactory().Create() };
                layout.LayoutComponents.Add(new LiveSplit.UI.Components.LayoutComponent("LiveSplit.ZombiesTracker.dll",settingsProbe));
                var saver=new LiveSplit.UI.LayoutSavers.XMLLayoutSaver();
                int hash=saver.CreateLayoutNode(null,null,layout);
                for(int i=0;i<60;i++) if(hash!=saver.CreateLayoutNode(null,null,layout)) throw new Exception("Layout hash changed on render poll");
                Check(true,"LiveSplit layout hash stable across 60 render polls");
                settingsDoc.DocumentElement["ProtectedToken"].InnerText=Convert.ToBase64String(Protection.Protect(Encoding.UTF8.GetBytes("replacement-test-key")));
                settingsProbe.SetSettings(settingsDoc.DocumentElement);
                Check(hash!=saver.CreateLayoutNode(null,null,layout),"changed key invalidates settings hash");
                var replacementXml=settingsProbe.GetSettings(new XmlDocument());
                Check(Encoding.UTF8.GetString(Protection.Unprotect(Convert.FromBase64String(replacementXml["ProtectedToken"].InnerText)))=="replacement-test-key","saved key updates correctly");
            }
            var profile = new RunProfile { map = "der-eisendrache", category = "No Gums", players = 1, timing = "RealTime" };
            var historyRun = new Run(new LiveSplit.Model.Comparisons.StandardComparisonGeneratorsFactory());
            historyRun.Add(new Segment("Rocket")); historyRun.Add(new Segment("R7")); historyRun.Add(new Segment("End"));
            historyRun[0].PersonalBestSplitTime = new Time { RealTime = TimeSpan.FromSeconds(355) };
            historyRun[0].BestSegmentTime = new Time { RealTime = TimeSpan.FromSeconds(334) };
            historyRun[1].PersonalBestSplitTime = new Time { RealTime = TimeSpan.FromSeconds(438) };
            historyRun[1].BestSegmentTime = new Time { RealTime = TimeSpan.FromSeconds(60) };
            historyRun[2].PersonalBestSplitTime = new Time { RealTime = TimeSpan.FromSeconds(1625) };
            historyRun[0].SegmentHistory[1] = new Time { RealTime = TimeSpan.FromSeconds(340) };
            historyRun[1].SegmentHistory[1] = new Time { RealTime = TimeSpan.FromSeconds(65) };
            historyRun[1].SegmentHistory[2] = new Time { RealTime = TimeSpan.FromSeconds(1) };
            historyRun[0].SegmentHistory[3] = new Time();
            historyRun[1].SegmentHistory[3] = new Time { RealTime = TimeSpan.FromSeconds(410) };
            var history = Protocol.ReadRecords(historyRun);
            Check(history.splits[0].name == "Rocket" && history.splits[0].bestSplitMs == 334000 && history.splits[0].bestSegmentMs == 334000, "Rocket best is gold, not PB comparison");
            Check(history.splits[1].bestSplitMs == 405000 && history.splits[1].bestSegmentMs == 60000, "cumulative history and segment are independent; missing prefix excluded");
            Check(history.splits[0].pbSplitMs == (long)historyRun[0].PersonalBestSplitTime.RealTime.Value.TotalMilliseconds, "PB checkpoint stays separate from best split and gold");
            Check(history.pbMs == 1625000, "PB from final Personal Best comparison");
            historyRun[2].PersonalBestSplitTime = new Time {RealTime=TimeSpan.FromSeconds(1625),GameTime=TimeSpan.FromSeconds(1500)};
            Check(Protocol.ReadRecords(historyRun).pbIgtMs==1500000,"saved PB reads paired Game Time");
            Check(historyRun[0].PersonalBestSplitTime.RealTime.Value.TotalSeconds == 355 && historyRun[0].BestSegmentTime.RealTime.Value.TotalSeconds == 334, "record reading does not mutate comparisons");
            model.Start();
            Check(Protocol.Capture(state, profile, "test-attempt", 1, false, false).igtMs == null,"uninitialized game time stays absent");
            var bo2Profile=new RunProfile {game="bo2",map="bo2-origins",category="Standard",players=1,timing="GameTime"};
            bool missingIgt=false;try{Protocol.Capture(state,bo2Profile,"bo2-missing",1,false,false);}catch(InvalidOperationException){missingIgt=true;}Check(missingIgt,"missing IGT never falls back to RTA");
            model.InitializeGameTime(); state.IsGameTimePaused = true; state.SetGameTime(TimeSpan.FromSeconds(7));
            Pump(40); model.Split();
            state.CurrentTimingMethod = TimingMethod.GameTime;
            var sample = Protocol.Capture(state, profile, "test-attempt", 1, false, false);
            Check(sample.splits.Count == 1 && sample.splits[0].name == "Bow Done" && sample.splits[0].ms > 0, "original split name / RTA despite GameTime display");
            Check(sample.igtMs == 7000 && sample.splits[0].igtMs == 7000,"live and checkpoint IGT captured separately from RTA");
            var bo2Sample=Protocol.Capture(state,bo2Profile,"bo2-test",1,false,false);
            Check(bo2Sample.elapsedMs==7000 && bo2Sample.splits[0].ms==7000,"BO2 primary and split use Game Time");
            Check(bo2Sample.realTime!=null && bo2Sample.realTime.splits[0].ms==sample.splits[0].ms,"BO2 retains paired RTA");
            Check(Protocol.ReadRecords(historyRun,TimingMethod.GameTime).pbMs==1500000 && Protocol.ReadRecords(historyRun,TimingMethod.GameTime).pbRealTimeMs==1625000,"BO2 PB primary IGT paired RTA");
            Check(SplitAliases.Known("bo2-mob-of-the-dead","Flight 3")=="Fly 3" && SplitAliases.Known("bo2-origins","Freedom")=="End","BO2 aliases use Fly and End");
            Check(Detector.Detect("", "Origins", "", new Dictionary<string,string>(),new string[0],"",null,"bo2").Map=="bo2-origins","explicit BO2 selector");
            Check(!Detector.Detect("BO3", "Origins", "", new Dictionary<string,string>(),new string[0],"",null,"bo2").Success,"BO2 selector cannot relabel BO3 Origins");
            model.Pause();
            sample = Protocol.Capture(state, profile, "test-attempt", 2, false, false);
            Check(sample.elapsedMs == (long)Math.Round(state.CurrentTime.RealTime.Value.TotalMilliseconds), "paused elapsed equals LiveSplit RTA exactly");
            Pump(40); Check(Protocol.Capture(state, profile, "test-attempt", 3, false, false).elapsedMs == sample.elapsedMs, "no independent clock during pause");
            model.Pause();
            model.SkipSplit(); sample = Protocol.Capture(state, profile, "test-attempt", 2, false, false);
            Check(!sample.complete && sample.splits.Count == 1, "skip incomplete");
            model.UndoSplit(); model.UndoSplit(); sample = Protocol.Capture(state, profile, "test-attempt", 3, false, false);
            Check(sample.splits.Count == 0, "undo removes checkpoints");
            model.Reset(false); sample = Protocol.Capture(state, profile, "test-reset", 1, false, false);
            Check(sample.phase == "NotRunning" && sample.splits.Count == 0 && sample.index == -1, "reset");
            Check(sample.igtMs == null,"reset clears IGT");
            string lifecycleDir=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ZombiesTracker-Lifecycle-"+Guid.NewGuid());
            var delayed=new DelayedUpload();
            string lifecycleKey=Guid.NewGuid().ToString();
            var oldQueue=new UploadQueue("http://localhost:1",lifecycleKey,lifecycleDir,delayed);
            oldQueue.Enqueue(sample);
            Check(delayed.Started.WaitOne(2000),"stalled upload started");
            Exception closeError=null;
            var closer=new Thread(delegate(){try{oldQueue.Dispose();oldQueue.Dispose();}catch(Exception ex){closeError=ex;}}){IsBackground=true};
            closer.Start();Check(closer.Join(1000),"close never waits for stalled HTTP upload");Check(closeError==null,"dispose is idempotent and safe from another thread");
            using(var replacementQueue=new UploadQueue("http://localhost:1",lifecycleKey,lifecycleDir)) {
                Check(replacementQueue.Count==1,"replacement immediately recovers pending upload");
                delayed.Response.SetResult(new HttpResponseMessage(HttpStatusCode.OK));
                Pump(150);
                Check(replacementQueue.Count==1,"late completion cannot acknowledge replacement queue");
            }
            using(var reopenedQueue=new UploadQueue("http://localhost:1",lifecycleKey,lifecycleDir))Check(reopenedQueue.Count==1,"late old response cannot overwrite persisted queue");
            using(var firstLayout=new TrackerComponent(state))using(var secondLayout=new TrackerComponent(state)) {
                var activeField=typeof(TrackerComponent).GetField("activated",BindingFlags.NonPublic|BindingFlags.Instance);
                UseLayout(state,firstLayout);Pump(1200);
                Check((bool)activeField.GetValue(firstLayout),"timer activates current layout without rendering callback");
                Check(!(bool)activeField.GetValue(secondLayout),"timer leaves editor clone inactive");
                state.Layout.LayoutComponents.Add(new LiveSplit.UI.Components.LayoutComponent("LiveSplit.ZombiesTracker.dll",secondLayout));
                secondLayout.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                Pump(1200);
                Check(!(bool)activeField.GetValue(secondLayout) && (bool)activeField.GetValue(firstLayout),"duplicate in same layout cannot steal ownership");
                UseLayout(state,secondLayout);secondLayout.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                Check(!(bool)activeField.GetValue(firstLayout),"switching layouts deactivates previous component");
                UseLayout(state,null);Pump(1100);
                Check(!(bool)activeField.GetValue(secondLayout),"layout without addon stops old tracker");
                UseLayout(state,firstLayout);firstLayout.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                Check((bool)activeField.GetValue(firstLayout),"returning to saved layout reactivates tracker");
                var newRun=new Run(new LiveSplit.Model.Comparisons.StandardComparisonGeneratorsFactory());
                newRun.GameName=run.GameName;newRun.CategoryName=run.CategoryName;newRun.Add(new Segment("Rocket"));
                state.Run=newRun;
                typeof(TrackerComponent).GetField("frozen",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(firstLayout,"old-file");
                typeof(TrackerComponent).GetMethod("Capture",BindingFlags.NonPublic|BindingFlags.Instance).Invoke(firstLayout,new object[]{false,false});
                Check(typeof(TrackerComponent).GetField("frozen",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(firstLayout)==null,"loading another split file clears previous attempt fingerprint");
                Check(ReferenceEquals(state.Run,newRun),"tracker never replaces the selected split file");
                state.Run=run;
            }
            if (args.Length == 2)
            {
                using (var component = new TrackerComponent(state))
                {
                    var doc = new XmlDocument(); var root = doc.CreateElement("Settings"); doc.AppendChild(root);
                    Action<string,string> set = (k,v) => { var n=doc.CreateElement(k); n.InnerText=v; root.AppendChild(n); };
                    set("Enabled","True"); set("Server",args[0]);
                    set("ProtectedToken",Convert.ToBase64String(Protection.Protect(Encoding.UTF8.GetBytes(args[1]))));
                    set("Aliases","{\"Bow Done\":\"bow\"}"); component.SetSettings(root);
                    Check(component.GetSettings(new XmlDocument())["Aliases"] == null, "legacy aliases are discarded on save");
                    using(var editorClone = new TrackerComponent(state)) {
                        editorClone.SetSettings(root);
                        Check(editorClone.GetSettings(new XmlDocument())["Enabled"].InnerText == "True", "editor clone keeps enabled settings without claiming uploader");
                    }
                    UseLayout(state,component);component.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                    Pump(200); model.Start(); Pump(100);
                    var idField=typeof(TrackerComponent).GetField("id",BindingFlags.NonPublic|BindingFlags.Instance);
                    string beforeSettings=(string)idField.GetValue(component);
                    component.SetSettings(component.GetSettings(new XmlDocument()));
                    Check((string)idField.GetValue(component)==beforeSettings, "confirming unchanged settings preserves active attempt");
                    Check(state.CurrentPhase==TimerPhase.Running && state.CurrentSplitIndex==0, "settings roundtrip never changes timer state");
                    using(var replacement=new TrackerComponent(state)) {
                    replacement.SetSettings(component.GetSettings(new XmlDocument()));
                    UseLayout(state,replacement);replacement.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                    Check((string)idField.GetValue(replacement)==beforeSettings, "layout replacement preserves attempt identity");
                    model.Split(); model.Pause(); Pump(100); model.Pause();
                    model.SkipSplit(); model.UndoSplit(); Pump(100); model.Split(); Pump(100); model.Split(); Pump(300);
                    var exported = component.GetSettings(new XmlDocument()).OuterXml;
                    Check(!exported.Contains(args[1]), "key not stored as raw text in layout");
                    model.Reset(false); Pump(500);
                    }
                }
                string queueDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ZombiesTracker-Tests-Replay");
                using (var queue = new UploadQueue(args[0], args[1], queueDir))
                {
                    bool duplicate = false;
                    try { using (var other = new UploadQueue(args[0], args[1], queueDir)) { } } catch { duplicate = true; }
                    Check(duplicate, "duplicate component blocked");
                    var pending = Protocol.Capture(state, profile, "offline-attempt", 1, false, false);
                    queue.Enqueue(pending); Pump(200); Check(queue.Count == 1, "503 keeps event in queue");
                }
                using (var recovered = new UploadQueue(args[0], args[1], queueDir))
                {
                    Check(recovered.Count == 1, "pending event recovered from disk");
                    recovered.Flush(); Pump(500); Check(recovered.Count == 0, "recovered event acknowledged");
                }
            }
            if(args.Length==2) {
                var bo2Run=new Run(new LiveSplit.Model.Comparisons.StandardComparisonGeneratorsFactory());
                bo2Run.GameName="Black Ops II Zombies";bo2Run.CategoryName="Mob of the Dead Solo";bo2Run.Add(new Segment("Dryer"));bo2Run.Add(new Segment("End"));
                state.Run=bo2Run;
                using(var component=new TrackerComponent(state)) {
                    var doc=new XmlDocument();doc.LoadXml("<Settings><Enabled>True</Enabled><Server>"+args[0]+"</Server><ProtectedToken>"+Convert.ToBase64String(Protection.Protect(Encoding.UTF8.GetBytes(args[1])))+"</ProtectedToken></Settings>");component.SetSettings(doc.DocumentElement);
                    UseLayout(state,component);component.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                    model.Start();model.InitializeGameTime();state.IsGameTimePaused=true;state.SetGameTime(TimeSpan.FromSeconds(10));Pump(100);model.Split();Pump(200);
                    model.Pause();Pump(100);model.Pause();state.SetGameTime(TimeSpan.FromSeconds(20));model.Split();Pump(1200);
                    var bo2Queue=(UploadQueue)typeof(TrackerComponent).GetField("uploader",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(component);
                    for(int wait=0;wait<80 && bo2Queue!=null && bo2Queue.Count>0;wait++){bo2Queue.Flush();Pump(100);}
                    Check(bo2Queue!=null && bo2Queue.Count==0,"BO2 queue delivered: "+(bo2Queue==null?"missing uploader":bo2Queue.Status));
                    var debugPanel=typeof(TrackerComponent).GetField("panel",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(component);
                    Console.WriteLine("BO2 native status: "+((Label)debugPanel.GetType().GetField("detection",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(debugPanel)).Text+" | "+((Label)debugPanel.GetType().GetField("status",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(debugPanel)).Text);
                    Check(state.CurrentPhase==TimerPhase.Ended,"native BO2 run finished without tracker changing timer");
                }
            }
            var pbFile=Path.Combine(Path.GetTempPath(),Guid.NewGuid().ToString()+".lss");
            try {
                var xml="<Run><GameName>Call of Duty: Black Ops III Zombies</GameName><CategoryName>Der Eisendrache</CategoryName><Segments><Segment><Name>End</Name><SplitTimes><SplitTime name='Personal Best'><RealTime>00:25:48.0000000</RealTime></SplitTime></SplitTimes></Segment></Segments></Run>";
                File.WriteAllText(pbFile,xml);
                var imported=new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(FolderPBSync.ReadPB(pbFile));
                Check(imported.Contains("1548000") && imported.Contains("Mega Gums") && imported.Contains("der-eisendrache"),"folder PB reads final RTA and automatic category");
                File.WriteAllText(pbFile,xml.Replace("Black Ops III","Black Ops II").Replace("Der Eisendrache","Origins").Replace("RealTime","GameTime"));
                imported=new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(FolderPBSync.ReadPB(pbFile));
                Check(imported.Contains("bo2-origins") && imported.Contains("GameTime"),"folder PB uses BO2 IGT");
                File.WriteAllText(pbFile,xml.Replace("Black Ops III","Black Ops IV"));
                bool pbRejected=false;try{FolderPBSync.ReadPB(pbFile);}catch{pbRejected=true;}Check(pbRejected,"folder PB rejects unsupported game");
                File.WriteAllText(pbFile,xml.Replace("00:25:48.0000000",""));
                pbRejected=false;try{FolderPBSync.ReadPB(pbFile);}catch{pbRejected=true;}Check(pbRejected,"folder PB rejects missing finish time");
            } finally {File.Delete(pbFile);}
            Console.WriteLine("PASS " + assertions + " addon assertions"); return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
    }
}






