using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Xml;
using LiveSplit.Model;
namespace LiveSplit.ZombiesTracker {
 public static class AutosplitBridge {
  static readonly Dictionary<string,string> Keys=new Dictionary<string,string> {
   {"shadows-of-evil","zm_zod"},{"der-eisendrache","zm_castle"},{"zetsubou-no-shima","zm_island"},
   {"gorod-krovi","zm_stalingrad"},{"revelations","zm_genesis"},{"origins","zm_tomb"},{"moon","zm_moon"}
  };
  static object Property(object o,string name) { var p=o==null?null:o.GetType().GetProperty(name,BindingFlags.Public|BindingFlags.Instance);return p==null?null:p.GetValue(o,null); }
  // Read public ASL variables and a detached settings XML. Never run a script,
  // change checkboxes, rename segments, or touch LiveSplit comparisons.
  public static string[] Read(LiveSplitState state,string map,out string status) {
   status="Split names: rules fallback";
   try {
    if(state.Layout==null)return null;
    var components=state.Layout.LayoutComponents.Where(c=>c.Component!=null&&c.Component.GetType().FullName=="LiveSplit.UI.Components.ASLComponent").ToArray();
    if(components.Length!=1)return null;
    var component=components[0].Component;
    var script=Property(component,"Script");
    var vars=Property(script,"Vars") as IDictionary<string,object>;
    object dictionary;
    if(vars==null||!vars.TryGetValue("split_names",out dictionary))return null;
    var maps=dictionary as IDictionary<string,Dictionary<int,string>>;
    string key;
    if(maps==null||!Keys.TryGetValue(map,out key)||!maps.ContainsKey(key))return null;
    // Runtime data, when exposed, must agree with the labelled map.
    var data=Property(Property(script,"State"),"Data") as IDictionary<string,object>;
    object current;
    if(data!=null&&data.TryGetValue("map_name",out current)&&current is string&&((string)current).StartsWith("zm_")&&(string)current!=key){status="Autosplitter map differs; split hints ignored";return null;}
    var names=Select(maps[key],component.GetSettings(new XmlDocument()),key,state.Run.Count);
    if(names!=null&&!Compatible(map,state.Run.Select(s=>s.Name).ToArray(),names))names=null;
    if(names==null){status="Autosplitter layout differs; rules fallback";return null;}
    status="Split names: autosplitter";return names;
   }catch {status="Autosplitter unavailable; rules fallback";return null;}
  }
  public static bool Compatible(string map,string[] original,string[] hints) {
   if(original.Length!=hints.Length)return false;
   for(int i=0;i<original.Length;i++) {
    var expected=SplitAliases.Known(map,original[i]);
    var actual=SplitAliases.Known(map,hints[i]);
    if(expected!=null&&expected!=(actual??hints[i]))return false;
   }
   return true;
  }
  public static string[] Select(IDictionary<int,string> order,XmlNode settings,string map,int count) {
   if(settings==null||settings["Split"]==null||!string.Equals(settings["Split"].InnerText,"true",StringComparison.OrdinalIgnoreCase))return null;
   var values=new Dictionary<string,bool>();
   foreach(XmlNode n in settings.SelectNodes("CustomSettings/Setting")) {
    bool value;var id=n.Attributes["id"];
    if(id!=null&&bool.TryParse(n.InnerText,out value)){if(values.ContainsKey(id.Value))return null;values.Add(id.Value,value);}
   }
   bool enabled;if(!values.TryGetValue(map,out enabled)||!enabled)return null;
   // Missing values are not assumed checked: a partly loaded script is ambiguous.
   if(order.Any(k=>!values.ContainsKey(k.Value)))return null;
   var names=order.OrderBy(k=>k.Key).Where(k=>values[k.Value]).Select(k=>k.Value).ToArray();
   return names.Length==count&&count>0&&names.Distinct().Count()==count?names:null;
  }
 }
}
