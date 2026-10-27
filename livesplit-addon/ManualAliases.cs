using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;
using System.Drawing;
namespace LiveSplit.ZombiesTracker {
 public sealed class SplitLink { public string Map {get;set;} public string Category {get;set;} public string Source {get;set;} public string Target {get;set;} }
 public static class ManualAliases {
  public static readonly string[] Core = {"shadows-of-evil","the-giant","der-eisendrache","zetsubou-no-shima","gorod-krovi","revelations"};
  public static string[] Targets(string map) {
   if(map=="super-easter-egg") return Core.SelectMany(id=>Targets(id).Where(n=>n!="End").Select(n=>Detector.Maps.First(m=>m.Id==id).Name+" - "+n).Concat(new[]{Detector.Maps.First(m=>m.Id==id).Name+" - Complete"})).ToArray();
   if(map=="iw-mephistopheles-super" || map=="bo2-victis-super")return SplitAliases.Canonical(map);
   return SplitAliases.Canonical(map).Concat(new[]{"End"}).Concat(map=="zetsubou-no-shima"?new[]{"KT4"}:new string[0]).Distinct().ToArray();
  }
  public static string[] Targets(string map,string category) {
   return Targets(map).Where(n=>!(map=="iw-spaceland" && category!=null && category.StartsWith("DC") && n=="Round 9 End")
    && !(map=="iw-attack-of-the-radioactive-thing" && (category=="Fate"||category=="FF") && n=="Death Reset")
    && !(map=="bo2-tranzit" && category!=null && category.Contains("Maxis") && (n=="Jetgun"||n=="Tower"))
    && !(map=="bo2-tranzit" && category!=null && category.Contains("Richtofen") && n=="Power off")).ToArray();
  }
  public static List<SplitLink> Validate(IEnumerable<SplitLink> links) {
   var result=new List<SplitLink>();
   foreach(var link in links??new SplitLink[0]) {
    if(link==null||!Detector.Maps.Any(m=>m.Enabled&&m.Id==link.Map)) throw new InvalidOperationException("Choose a supported map for each split alias.");
    var row=new SplitLink{Map=link.Map,Category=string.IsNullOrEmpty(link.Category)?null:link.Category,Source=Protocol.Clean(link.Source),Target=Protocol.Clean(link.Target)};
    // Preserve saved layouts when the Revelations split labels change.
    if(row.Map=="revelations" || Detector.IsBo2(row.Map)) row.Target=SplitAliases.Known(row.Map,row.Target)??row.Target;
    if(row.Map=="super-easter-egg" && row.Target.StartsWith("Revelations - ")) row.Target="Revelations - "+(SplitAliases.Known("revelations",row.Target.Substring(14))??row.Target.Substring(14));
    if(row.Category!=null && !Detector.CategoriesForMap(row.Map).Contains(row.Category))throw new InvalidOperationException("Choose a supported category for each alias.");
    if(!Targets(row.Map,row.Category).Contains(row.Target)) throw new InvalidOperationException("Choose a split from the dropdown.");
    if(result.Any(r=>r.Map==row.Map&&r.Category==row.Category&&Detector.Normalize(r.Source)==Detector.Normalize(row.Source))) throw new InvalidOperationException("Each LiveSplit name can have only one mapping per map and category.");
    result.Add(row);
    if(result.Count>2000)throw new InvalidOperationException("Too many split aliases.");
   }
   return result.OrderBy(r=>r.Map).ThenBy(r=>r.Category).ThenBy(r=>r.Source,StringComparer.OrdinalIgnoreCase).ToList();
  }
  public static List<SplitLink> Migrate(IEnumerable<SplitLink> links) {
   var rows=Validate(links);
   return Validate(rows.Where(r=>r.Category!=null).Concat(rows.Where(r=>r.Category==null).SelectMany(r=>Detector.CategoriesForMap(r.Map).Where(c=>Targets(r.Map,c).Contains(r.Target)&&!rows.Any(x=>x.Map==r.Map&&x.Category==c&&Detector.Normalize(x.Source)==Detector.Normalize(r.Source))).Select(c=>new SplitLink{Map=r.Map,Category=c,Source=r.Source,Target=r.Target}))));
  }
  public static string[] Resolve(IEnumerable<SplitLink> links,string map,string category,string[] names,string[] automatic) {
   return Resolve(Migrate(links).Where(r=>r.Category==category),map,names,automatic);
  }
  public static string[] Resolve(IEnumerable<SplitLink> links,string map,string[] names,string[] automatic) {
   var rows=Validate(links).Where(r=>r.Map==map).ToArray();
   var resolved=names.Select((name,i)=>{var row=rows.FirstOrDefault(r=>Detector.Normalize(r.Source)==Detector.Normalize(name));return row!=null?row.Target:automatic!=null?automatic[i]:name;}).ToArray();
   if(resolved.Select(Detector.Normalize).Distinct().Count()!=resolved.Length)throw new InvalidOperationException("Two splits resolve to the same split. Give them distinct mappings before uploading.");
   return resolved;
  }
 }
 public sealed class AliasEditor : UserControl {
  readonly ComboBox maps=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Dock=DockStyle.Top};
  readonly ComboBox categories=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Dock=DockStyle.Top};
  readonly DataGridView grid=new DataGridView{Dock=DockStyle.Fill,AllowUserToAddRows=true,AllowUserToDeleteRows=true,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,RowHeadersWidth=24};
  List<SplitLink> saved=new List<SplitLink>(); string followedCategory=""; string selectedCategory=""; string selected; bool loading;
  public AliasEditor() {
   Height=270;
   var label=new Label{Text="Split aliases - follows loaded splits; saved per map and category.",Dock=DockStyle.Top,Height=22};
   Controls.Add(grid);Controls.Add(categories);Controls.Add(maps);Controls.Add(label);
   grid.Columns.Add(new DataGridViewTextBoxColumn{HeaderText="Your LiveSplit name",Name="source"});
   grid.Columns.Add(new DataGridViewComboBoxColumn{HeaderText="Tracker split",Name="target",FlatStyle=FlatStyle.Flat});
   categories.SelectedIndexChanged+=delegate {if(!loading && categories.SelectedItem!=null) {SaveRows();selectedCategory=(string)categories.SelectedItem;ShowMap(selected);}};
   grid.DataError+=(s,e)=>{e.ThrowException=false;};
   // Maps are populated only after the game is known.
   maps.SelectedIndexChanged+=delegate { if(loading)return; try{SaveRows();ShowMap(maps.SelectedItem is MapInfo?((MapInfo)maps.SelectedItem).Id:null);}catch(Exception ex){MessageBox.Show(ex.Message,"Split aliases");loading=true;maps.SelectedItem=Detector.Maps.First(m=>m.Id==selected);loading=false;} };

  }
  void SaveRows() {
   if(selected==null || string.IsNullOrEmpty(selectedCategory))return;
   grid.EndEdit(); var rows=new List<SplitLink>();
   foreach(DataGridViewRow r in grid.Rows) {
    if(r.IsNewRow)continue;
    var source=Convert.ToString(r.Cells[0].Value).Trim();var target=Convert.ToString(r.Cells[1].Value).Trim();
    if(source==""&&target=="")continue;
    if(source==""||target=="")throw new InvalidOperationException("Fill in both the LiveSplit name and split, or delete the row.");
    rows.Add(new SplitLink{Map=selected,Category=selectedCategory,Source=source,Target=target});
   }
   saved=ManualAliases.Validate(saved.Where(r=>r.Map!=selected || r.Category!=selectedCategory).Concat(rows));
  }
  void ShowMap(string id) {
   selected=id;grid.Rows.Clear();grid.Enabled=id!=null;
   bool wasLoading=loading;loading=true;
   try {
    categories.Items.Clear();if(id!=null)categories.Items.AddRange(Detector.CategoriesForMap(id));
    if(!categories.Items.Contains(selectedCategory))selectedCategory=categories.Items.Count>0?(string)categories.Items[0]:"";
    categories.SelectedItem=selectedCategory;categories.Enabled=id!=null;
   } finally {loading=wasLoading;}
   var col=(DataGridViewComboBoxColumn)grid.Columns[1];col.Items.Clear();if(id==null)return;
   col.Items.AddRange(ManualAliases.Targets(id,selectedCategory));
   foreach(var r in saved.Where(r=>r.Map==id && r.Category==selectedCategory))grid.Rows.Add(r.Source,r.Target);
  }
  public void FilterGame(string game) {
   SaveRows();loading=true;
   try {
    maps.Items.Clear();
    foreach(var map in Detector.Maps.Where(m=>m.Enabled && (game=="bo2" || game=="bo3" || game=="iw") && Detector.GameForMap(m.Id)==game))maps.Items.Add(map);
    var current=maps.Items.Cast<MapInfo>().FirstOrDefault(m=>m.Id==selected);
    maps.SelectedItem=current;ShowMap(current==null?null:current.Id);
   } finally {loading=false;}
  }
  public void SetCategory(string value) { value=value??"";if(followedCategory==value)return;SaveRows();followedCategory=value;selectedCategory=value;ShowMap(selected); }
  public void FollowMap(string id) {
   id=maps.Items.Cast<MapInfo>().Any(m=>m.Id==id)?id:null;
   if(selected==id)return;
   SaveRows(); // Validate before switching; never discard an unfinished edit.
   loading=true;
   try { maps.SelectedItem=Detector.Maps.FirstOrDefault(m=>m.Id==id);ShowMap(id); }
   finally { loading=false; }
  }
  public List<SplitLink> Read() {SaveRows();return ManualAliases.Validate(saved);}
  public string SelectedMap { get { return selected ?? ""; } }
  public void RestoreMap(string id) {
   var map=maps.Items.Cast<MapInfo>().FirstOrDefault(m=>m.Id==id);
   if(map==null)return; // Older layouts have no saved selection.
   loading=true;
   try { maps.SelectedItem=map;ShowMap(map.Id); }
   finally { loading=false; }
  }
  public void LoadLinks(IEnumerable<SplitLink> links) {saved=ManualAliases.Migrate(links);ShowMap(selected);}
 }
}
