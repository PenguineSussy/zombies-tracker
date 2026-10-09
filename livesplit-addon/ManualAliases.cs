using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;
using System.Drawing;
namespace LiveSplit.ZombiesTracker {
 public sealed class SplitLink { public string Map {get;set;} public string Source {get;set;} public string Target {get;set;} }
 public static class ManualAliases {
  public static readonly string[] Core = {"shadows-of-evil","the-giant","der-eisendrache","zetsubou-no-shima","gorod-krovi","revelations"};
  public static string[] Targets(string map) {
   if(map=="super-easter-egg") return Core.SelectMany(id=>Targets(id).Where(n=>n!="End").Select(n=>Detector.Maps.First(m=>m.Id==id).Name+" - "+n).Concat(new[]{Detector.Maps.First(m=>m.Id==id).Name+" - Complete"})).ToArray();
   return SplitAliases.Canonical(map).Concat(new[]{"End"}).Concat(map=="zetsubou-no-shima"?new[]{"KT4"}:new string[0]).Distinct().ToArray();
  }
  public static List<SplitLink> Validate(IEnumerable<SplitLink> links) {
   var result=new List<SplitLink>();
   foreach(var link in links??new SplitLink[0]) {
    if(link==null||!Detector.Maps.Any(m=>m.Enabled&&m.Id==link.Map)) throw new InvalidOperationException("Choose a supported map for each split alias.");
    var row=new SplitLink{Map=link.Map,Source=Protocol.Clean(link.Source),Target=Protocol.Clean(link.Target)};
    if(!Targets(row.Map).Contains(row.Target)) throw new InvalidOperationException("Choose a checkpoint from the dropdown.");
    if(result.Any(r=>r.Map==row.Map&&Detector.Normalize(r.Source)==Detector.Normalize(row.Source))) throw new InvalidOperationException("Each LiveSplit name can have only one mapping per map.");
    result.Add(row);
    if(result.Count>2000)throw new InvalidOperationException("Too many split aliases.");
   }
   return result.OrderBy(r=>r.Map).ThenBy(r=>r.Source,StringComparer.OrdinalIgnoreCase).ToList();
  }
  public static string[] Resolve(IEnumerable<SplitLink> links,string map,string[] names,string[] automatic) {
   var rows=Validate(links).Where(r=>r.Map==map).ToArray();
   var resolved=names.Select((name,i)=>{var row=rows.FirstOrDefault(r=>Detector.Normalize(r.Source)==Detector.Normalize(name));return row!=null?row.Target:automatic!=null?automatic[i]:name;}).ToArray();
   if(resolved.Select(Detector.Normalize).Distinct().Count()!=resolved.Length)throw new InvalidOperationException("Two splits resolve to the same checkpoint. Give them distinct mappings before uploading.");
   return resolved;
  }
 }
 public sealed class AliasEditor : UserControl {
  readonly ComboBox maps=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Dock=DockStyle.Top};
  readonly DataGridView grid=new DataGridView{Dock=DockStyle.Fill,AllowUserToAddRows=true,AllowUserToDeleteRows=true,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,RowHeadersWidth=24};
  List<SplitLink> saved=new List<SplitLink>(); string selected; bool loading;
  public AliasEditor() {
   Height=245;
   var label=new Label{Text="Split aliases - select a map; leave unused rows blank.",Dock=DockStyle.Top,Height=22};
   Controls.Add(grid);Controls.Add(maps);Controls.Add(label);
   grid.Columns.Add(new DataGridViewTextBoxColumn{HeaderText="Your LiveSplit name",Name="source"});
   grid.Columns.Add(new DataGridViewComboBoxColumn{HeaderText="Tracker checkpoint",Name="target",FlatStyle=FlatStyle.Flat});
   grid.DataError+=(s,e)=>{e.ThrowException=false;};
   foreach(var map in Detector.Maps.Where(m=>m.Enabled))maps.Items.Add(map);
   maps.SelectedIndexChanged+=delegate { if(loading)return; try{SaveRows();ShowMap(((MapInfo)maps.SelectedItem).Id);}catch(Exception ex){MessageBox.Show(ex.Message,"Split aliases");loading=true;maps.SelectedItem=Detector.Maps.First(m=>m.Id==selected);loading=false;} };
   maps.SelectedIndex=0;
  }
  void SaveRows() {
   if(selected==null)return;
   grid.EndEdit(); var rows=new List<SplitLink>();
   foreach(DataGridViewRow r in grid.Rows) {
    if(r.IsNewRow)continue;
    var source=Convert.ToString(r.Cells[0].Value).Trim();var target=Convert.ToString(r.Cells[1].Value).Trim();
    if(source==""&&target=="")continue;
    if(source==""||target=="")throw new InvalidOperationException("Fill in both the LiveSplit name and checkpoint, or delete the row.");
    rows.Add(new SplitLink{Map=selected,Source=source,Target=target});
   }
   saved=ManualAliases.Validate(saved.Where(r=>r.Map!=selected).Concat(rows));
  }
  void ShowMap(string id) { selected=id;grid.Rows.Clear();var col=(DataGridViewComboBoxColumn)grid.Columns[1];col.Items.Clear();col.Items.AddRange(ManualAliases.Targets(id));foreach(var r in saved.Where(r=>r.Map==id))grid.Rows.Add(r.Source,r.Target); }
  public List<SplitLink> Read() {SaveRows();return ManualAliases.Validate(saved);}
  public string SelectedMap { get { return selected ?? ""; } }
  public void RestoreMap(string id) {
   var map=Detector.Maps.FirstOrDefault(m=>m.Enabled && m.Id==id);
   if(map==null)return; // Older layouts have no saved selection.
   loading=true;
   try { maps.SelectedItem=map;ShowMap(map.Id); }
   finally { loading=false; }
  }
  public void LoadLinks(IEnumerable<SplitLink> links) {saved=ManualAliases.Validate(links);ShowMap(selected??((MapInfo)maps.SelectedItem).Id);}
 }
}
