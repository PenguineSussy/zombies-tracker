using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Xml;

namespace LiveSplit.ZombiesTracker
{
    // Reads saved files only; never loads or modifies the player's active Run.
    public sealed class FolderPBSync : IDisposable
    {
        readonly string folder;
        readonly List<SplitLink> aliases;
        readonly HttpClient http;
        readonly Uri endpoint;
        readonly CancellationTokenSource cancel = new CancellationTokenSource();
        readonly Dictionary<string,string> sent = new Dictionary<string,string>();
        DateTime next = DateTime.MinValue;
        Task worker;
        bool disposed;
        public volatile string Status = "Saved PB sync waiting.";
        public FolderPBSync(string server, string token, string folder, List<SplitLink> aliases)
        {
            this.folder=folder;this.aliases=aliases;
            endpoint=new Uri(UploadQueue.ValidateServer(server),"/api/me/import-pb");
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            http=new HttpClient(new HttpClientHandler {AllowAutoRedirect=false}) {Timeout=TimeSpan.FromSeconds(10)};
            http.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",token);
        }
        static string Text(XmlNode root,string path) {var node=root.SelectSingleNode(path);return node==null?"":node.InnerText;}
        static long? Time(XmlNode root,string path)
        {
            TimeSpan value;
            return TimeSpan.TryParse(Text(root,path),System.Globalization.CultureInfo.InvariantCulture,out value) && value.TotalMilliseconds>0 && value.TotalDays<7 ? (long?)Math.Round(value.TotalMilliseconds) : null;
        }
        public static object ReadPB(string file, List<SplitLink> aliases = null)
        {
            var settings=new XmlReaderSettings {DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=8000000};
            var doc=new XmlDocument {XmlResolver=null};
            using(var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))
            using(var reader=XmlReader.Create(stream,settings))doc.Load(reader);
            var run=doc.DocumentElement;
            if(run==null || run.Name!="Run")throw new InvalidOperationException("Not a LiveSplit file");
            var variables=new Dictionary<string,string>();
            foreach(XmlNode v in run.SelectNodes("Metadata/Variables/Variable|Metadata/CustomVariables/Variable"))
                if(v.Attributes["name"]!=null)variables[v.Attributes["name"].Value]=v.InnerText;
            var names=run.SelectNodes("Segments/Segment/Name").Cast<XmlNode>().Select(n=>n.InnerText).ToArray();
            var game=Text(run,"GameName");var category=Text(run,"CategoryName");
            var detected=Detector.Detect(game,category,Path.GetFileNameWithoutExtension(file),variables,names,"",aliases);
            if(!detected.Success || detected.NonSolo)throw new InvalidOperationException("Unsupported or ambiguous game/map/players");
            bool bo2=Detector.IsBo2(detected.Map);
            var selected=bo2?Detector.Bo2Category(new[]{category}.Concat(variables.Values),"",detected.Map):Detector.MetadataCategory(category,variables,"",detected.Map);
            if(selected==null || !Detector.CategoriesForMap(detected.Map).Contains(selected))throw new InvalidOperationException("Unsupported or ambiguous category");
            var last=run.SelectSingleNode("Segments/Segment[last()]/SplitTimes/SplitTime[@name='Personal Best']");
            if(last==null)throw new InvalidOperationException("No complete saved PB");
            var rta=Time(last,"RealTime");var igt=Time(last,"GameTime");var primary=bo2?igt:rta;
            if(primary==null)throw new InvalidOperationException(bo2?"No saved IGT PB":"No saved RTA PB");
            return new {profile=new {map=detected.Map,category=selected,players=1,timing=bo2?"GameTime":"RealTime"},pbMs=primary,pbIgtMs=igt,pbRealTimeMs=rta};
        }
        static IEnumerable<string> Files(string root)
        {
            // Do not follow junctions outside the explicitly chosen folder.
            foreach(var file in Directory.GetFiles(root,"*.lss"))
                if((File.GetAttributes(file)&FileAttributes.ReparsePoint)==0)yield return file;
            foreach(var directory in Directory.GetDirectories(root))
                if((File.GetAttributes(directory)&FileAttributes.ReparsePoint)==0)
                    foreach(var file in Files(directory))yield return file;
        }
        public void Tick()
        {
            if(disposed || (worker!=null&&!worker.IsCompleted) || DateTime.UtcNow<next)return;
            next=DateTime.UtcNow.AddMinutes(1);
            worker=Task.Run(async delegate {
                int synced=0;var skipped=new List<string>();
                try {
                    if(!Directory.Exists(folder))throw new IOException("Selected folder is unavailable");
                    var json=new JavaScriptSerializer();
                    foreach(var file in Files(folder)) {
                        if(cancel.IsCancellationRequested)return;
                        try {
                            var body=json.Serialize(ReadPB(file,aliases));string previous;
                            if(!sent.TryGetValue(file,out previous)||previous!=body) {
                                using(var content=new StringContent(body,System.Text.Encoding.UTF8,"application/json"))
                                using(var response=await http.PostAsync(endpoint,content,cancel.Token).ConfigureAwait(false)) {
                                    if(!response.IsSuccessStatusCode)throw new IOException("Upload HTTP "+(int)response.StatusCode);
                                }
                                sent[file]=body;
                            }
                            synced++;
                        } catch(OperationCanceledException){if(!disposed)Status="PB upload timed out; retrying next scan.";return;}
                        catch(Exception ex){skipped.Add(Path.GetFileName(file)+": "+ex.Message);}
                    }
                    Status="Saved PBs: "+synced+" synced; "+skipped.Count+" skipped or pending."+(skipped.Count==0?"":"\n"+string.Join("\n",skipped.Take(8))+(skipped.Count>8?"\nMore files need attention.":""));
                } catch(Exception ex){if(!disposed)Status="PB folder sync: "+ex.Message;}
            });
        }
        public void Dispose()
        {
            if(disposed)return;disposed=true;
            var pending=worker;
            Task.Run(async delegate {try {cancel.Cancel();if(pending!=null)await pending.ConfigureAwait(false);}catch{}finally{http.Dispose();cancel.Dispose();}});
        }
    }
}
