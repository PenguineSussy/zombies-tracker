using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace LiveSplit.ZombiesTracker
{
    public sealed class MapInfo
    {
        public string Id, Name;
        public bool Enabled;
        public string[] Aliases;
        public MapInfo(string id, string name, bool enabled, params string[] aliases)
        { Id = id; Name = name; Enabled = enabled; Aliases = aliases.Concat(new[] { name, id }).ToArray(); }
        public override string ToString() { return Name; }
    }
    public sealed class Detection
    {
        public string Map, Reason;
        public int? Players;
        public bool NonSolo;
        public bool Success { get { return Map != null; } }
    }
    public static class Detector
    {
        public static readonly string[] Categories = { "No Gums", "Classic Gums", "Mega Gums", "Any%" };
        public static bool IsBo2(string map) { return map != null && map.StartsWith("bo2-"); }
        public static readonly string[] Bo2Categories = { "No Bank Richtofen", "No Bank Maxis", "Bank Richtofen", "Bank Maxis" };
        public static string Bo2Category(IEnumerable<string> texts, string manual, string map) {
            if(map=="bo2-origins" || map=="bo2-mob-of-the-dead") return string.IsNullOrEmpty(manual)||manual=="Standard" ? "Standard" : null;
            if(!string.IsNullOrEmpty(manual)) return Bo2Categories.Contains(manual)?manual:null;
            var values=texts.ToArray(); var all=string.Join(" ",values); bool no=Has(all,"no bank"), bank=Has(all,"bank");
            if(no && values.Any(t=>Has(Regex.Replace(Normalize(t),@"\bno bank\b",""),"bank"))) return null;
            bool richtofen=Has(all,"richtofen"),maxis=Has(all,"maxis");
            if(!bank || richtofen==maxis) return null;
            return (no?"No Bank ":"Bank ")+(richtofen?"Richtofen":"Maxis");
        }
        public static string[] CategoriesForMap(string map)
        {
            if(IsBo2(map)) return map=="bo2-origins"||map=="bo2-mob-of-the-dead"?new[]{"Standard"}:Bo2Categories;
            if (map == "ascension" || map == "shangri-la") return new[]{"Any%"};
            return map == "zetsubou-no-shima" || map == "super-easter-egg" ? Categories.Where(c => c != "No Gums").ToArray() : Categories;
        }
        public static string Category(IEnumerable<string> texts, string manual)
        {
            if (!string.IsNullOrEmpty(manual)) return Categories.Contains(manual) ? manual : null;
            var found = new HashSet<string>();
            foreach (var text in texts)
            {
                if (Has(text, "no gums") || Has(text, "no gum") || Has(text, "no gobblegums") || Has(text, "no gobblegum")) found.Add("No Gums");
                if (Has(text, "classic") || Has(text, "classics")) found.Add("Classic Gums");
                if (Has(text, "mega") || Has(text, "megas")) found.Add("Mega Gums");
                if (Regex.IsMatch(text ?? "", @"\bany\s*%", RegexOptions.IgnoreCase)) found.Add("Any%");
            }
            return found.Count == 1 ? found.First() : null;
        }
        public static string RunCategory(string category, string manual, string map)
        {
            if (!string.IsNullOrWhiteSpace(manual)) return Category(new string[0], manual);
            if (string.IsNullOrWhiteSpace(category)) return CategoriesForMap(map).Contains("Mega Gums") ? "Mega Gums" : "Any%";
            return Category(new[]{category}, "");
        }
        public static string MetadataCategory(string category, IDictionary<string,string> variables, string manual, string map)
        {
            if (!string.IsNullOrWhiteSpace(manual)) return Category(new string[0], manual);
            var values = variables.Where(v => Has(v.Key,"gum") || Normalize(v.Key).Contains("gum") || Has(v.Key,"category")).Select(v => v.Value).Where(v => !string.IsNullOrWhiteSpace(v)).ToList();
            if (values.Count == 0) return RunCategory(category, manual, map);
            // Conflicting explicit categories must not silently fall back to Mega Gums.
            if (values.Any(v => Category(new[]{v}, "") == null)) return null;
            values.Add(category);
            return Category(values, "");
        }
        public static readonly MapInfo[] Maps = {
            new MapInfo("bo2-tranzit", "BO2 - TranZit", true, "TranZit"),
            new MapInfo("bo2-die-rise", "BO2 - Die Rise", true, "Die Rise"),
            new MapInfo("bo2-buried", "BO2 - Buried", true, "Buried"),
            new MapInfo("bo2-mob-of-the-dead", "BO2 - Mob of the Dead", true, "Mob of the Dead", "MOTD"),
            new MapInfo("bo2-origins", "BO2 - Origins", true, "Origins"),
            new MapInfo("super-easter-egg", "Super Easter Egg (6 maps)", true, "Super Easter Egg", "Super EE", "SuperEE"),
            new MapInfo("shadows-of-evil", "Shadows of Evil", true, "SOE"),
            new MapInfo("the-giant", "The Giant", true),
            new MapInfo("der-eisendrache", "Der Eisendrache", true, "DE"),
            new MapInfo("zetsubou-no-shima", "Zetsubou No Shima", true, "ZNS", "Zetsubou"),
            new MapInfo("gorod-krovi", "Gorod Krovi", true, "GK"),
            new MapInfo("revelations", "Revelations", true),
            new MapInfo("ascension", "Ascension", true),
            new MapInfo("shangri-la", "Shangri-La", true, "Shangri La"),
            new MapInfo("moon", "Moon", true),
            new MapInfo("origins", "Origins", true),
            new MapInfo("nacht-der-untoten", "Nacht der Untoten", false, "Nacht"),
            new MapInfo("verruckt", "Verruckt", false),
            new MapInfo("shi-no-numa", "Shi No Numa", false),
            new MapInfo("kino-der-toten", "Kino Der Toten", false, "Kino")
        };
        public static string Normalize(string s)
        {
            var b = new StringBuilder();
            foreach (char c in (s ?? "").Normalize(NormalizationForm.FormD))
                if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                    b.Append(char.IsLetterOrDigit(c) ? char.ToLowerInvariant(c) : ' ');
            return Regex.Replace(b.ToString(), @"\s+", " ").Trim();
        }
        static bool Has(string text, string phrase) { return (" " + Normalize(text) + " ").Contains(" " + Normalize(phrase) + " "); }
        static List<MapInfo> Matches(IEnumerable<string> texts, bool shortNames, bool bo2)
        {
            return Maps.Where(m => IsBo2(m.Id)==bo2 && m.Aliases.Any(a => (shortNames || Normalize(a).Length > 3) && texts.Any(t => Has(t, a)))).ToList();
        }
        static readonly string[] CoreIds = { "shadows-of-evil", "the-giant", "der-eisendrache", "zetsubou-no-shima", "gorod-krovi", "revelations" };
        public static string Stage(string name, bool completion)
        {
            var normalized = Normalize(name);
            foreach (var map in Maps.Where(m => CoreIds.Contains(m.Id)))
                foreach (var alias in map.Aliases.Concat(map.Id == "the-giant" ? new[]{"giant"} : map.Id == "revelations" ? new[]{"rev"} : new string[0]))
                {
                    string a = Normalize(alias);
                    if (completion ? new[]{a,a+" complete",a+" ee",a+" finish"}.Contains(normalized) : normalized == a || normalized.StartsWith(a + " ")) return map.Id;
                }
            return null;
        }
        public static string ValidateSuper(string[] names)
        {
            if (names.Length == 0) return "Super EE needs a single split file covering all six maps.";
            var stages = names.Select(n => Stage(n, false)).ToArray();
            if (stages.Any(s => s == null)) return "Prefix every Super EE split with its map, e.g. DE - Bow. End each map with Map - Complete.";
            var groups = new List<string>();
            for (int i=0;i<stages.Length;i++)
            {
                if (i==0 || stages[i]!=stages[i-1]) groups.Add(stages[i]);
                if (i==stages.Length-1 || stages[i]!=stages[i+1])
                    if (Stage(names[i],true)!=stages[i]) return "Each map block must end with a Map - Complete split.";
                if (i<stages.Length-1 && stages[i]==stages[i+1] && Stage(names[i],true)!=null)
                    return "Map completion must be the last split in its map block.";
            }
            if(groups.Count!=6 || groups.Distinct().Count()!=6 || groups.Last()!="revelations")
                return "Super EE requires all six core maps exactly once, with Revelations last.";
            return null;
        }
        static Detection Resolve(List<MapInfo> maps, string source)
        {
            if (maps.Count > 1) return new Detection { Reason = "Conflicting maps in " + source + ": " + string.Join(", ", maps.Select(m => m.Name)) };
            if (maps.Count == 1) return maps[0].Enabled ? new Detection { Map = maps[0].Id, Reason = maps[0].Name + " detected from " + source }
                : new Detection { Reason = maps[0].Name + " is disabled on this tracker." };
            return null;
        }
        public static Detection Detect(string game, string category, string fileTitle, IDictionary<string, string> variables, IEnumerable<string> splits, string manualMap, IEnumerable<SplitLink> aliases = null, string manualGame = "")
        {
            // Overrides must never bypass the supported-game boundary.
            var supportedGames = new[] { "bo3", "boiii", "black ops 3", "black ops iii", "call of duty black ops 3", "call of duty black ops iii" };
            bool mapTitle = false;
            string gameName = Normalize(game);
            if (gameName.EndsWith(" zombies")) gameName = gameName.Substring(0, gameName.Length - 8);
            bool namedBo2 = new[]{"bo2","boii","black ops 2","black ops ii","call of duty black ops 2","call of duty black ops ii"}.Contains(gameName);
            bool namedBo3 = supportedGames.Contains(gameName);
            bool bo2MapTitle=Maps.Any(m=>m.Enabled && IsBo2(m.Id) && m.Aliases.Any(a=>Normalize(a)==Normalize(game)));
            bool bo3MapTitle=Maps.Any(m=>m.Enabled && !IsBo2(m.Id) && m.Aliases.Any(a=>Normalize(a)==Normalize(game)));
            bool bo2 = manualGame=="bo2" || namedBo2 || (manualGame!="bo3" && bo2MapTitle && !bo3MapTitle);
            mapTitle=bo2?bo2MapTitle:bo3MapTitle;
            bool otherGame = new[]{"bo4","black ops iv","black ops 4"}.Any(g => Has(game,g)) || (manualGame=="bo3" && namedBo2) || (manualGame=="bo2" && (namedBo3 || (bo3MapTitle && !bo2MapTitle)));
            if (otherGame || (manualGame != "bo3" && manualGame != "bo2" && !namedBo2 && !namedBo3 && !mapTitle))
                return new Detection { Reason = "Unsupported game/map - tracking paused. Set Game Name to a supported BO3 map (for example Der Eisendrache), or Call of Duty: Black Ops III with a map label. For BO2 choose Black Ops II Zombies and include the map in Category Name." };
            foreach (var variable in variables.Where(v => new[]{"speedrun type","run type","objective"}.Contains(Normalize(v.Key))))
                if (!string.IsNullOrWhiteSpace(variable.Value) && !new[]{"easter egg","easter eggs","main easter egg","ee","super easter egg","super ee"}.Contains(Normalize(variable.Value)))
                    return new Detection { Reason = "Unsupported speedrun type - only Solo Easter Egg runs are tracked. Check Additional Info." };
            var names = splits.ToArray();
            var primary = new List<string> { game, category, fileTitle };
            foreach (var item in variables)
                if (Has(item.Key, "map") || Has(item.Key, "category")) primary.Add(item.Value);
            Detection result;
            if (!string.IsNullOrWhiteSpace(manualMap))
            {
                // Independently identify the split file so a saved override cannot relabel a new map.
                result = Detect(game, category, fileTitle, variables, names, "", aliases, manualGame);
                if (!result.Success) return result;
                if (result.Map != manualMap)
                    return new Detection { Reason = "Unsupported game/map - tracking paused. The selected map does not match the split file. Use automatic detection or correct the map selection." };
            }
            else
            {
                bool super = !bo2 && primary.Any(t => Has(t, "Super Easter Egg") || Has(t, "Super EE") || Has(t, "SuperEE"));
                result = super ? new Detection { Map = "super-easter-egg", Reason = "Super Easter Egg (6 maps) detected from run labels" } : Resolve(Matches(primary, true, bo2), "game/category, map variable, or split-file name");
                if (result == null) result = Resolve(Matches(names, false, bo2), "split names");
                if (result == null && !bo2)
                {
                    // Require two separate distinctive milestones. Generic Bow, Power and Boss are never sufficient.
                    var signatures = new Dictionary<string, string[][]> {
                        { "der-eisendrache", new[] { new[] { "lightning bow", "storm bow" }, new[] { "wisps", "wisp" } } },
                        { "zetsubou-no-shima", new[] { new[] { "kt4", "kt 4" }, new[] { "masamune" } } },
                        { "gorod-krovi", new[] { new[] { "dragon egg" }, new[] { "valkyrie", "valkyries" } } },
                        { "shadows-of-evil", new[] { new[] { "apothicon sword", "apothicon swords" }, new[] { "shadowman", "shadow man" } } }
                    };
                    var candidates = signatures.Where(pair => pair.Value.All(group => group.Any(word => names.Any(n => Has(n, word)))))
                        .Select(pair => Maps.First(m => m.Id == pair.Key)).ToList();
                    result = Resolve(candidates, "distinctive milestone pair");
                }
                if (result == null) result = new Detection { Reason = "Unsupported game/map - tracking paused. Include a supported map in Edit Splits > Category Name or the .lss filename. An override cannot enable an unknown map." };
            }
            var playerText = new List<string> { category, fileTitle };
            foreach (var v in variables)
                if (Has(v.Key, "players") || Has(v.Key, "player count")) playerText.Add(v.Value + " players");
            var counts = new HashSet<int>();
            foreach (var text in playerText)
            {
                if (Has(text, "solo")) counts.Add(1);
                foreach (Match match in Regex.Matches(Normalize(text), @"\b([1-4])\s*(?:p|player|players)\b")) counts.Add(int.Parse(match.Groups[1].Value));
            }
            result.Players = counts.Count == 1 ? (int?)counts.First() : null;
            result.NonSolo = counts.Any(c => c > 1) || playerText.Any(t => Has(t, "coop") || Has(t, "co op") || Has(t, "duo") || Has(t, "cooperative"));
            if(result.Map=="super-easter-egg") { var error=ValidateSuper(ManualAliases.Resolve(aliases,"super-easter-egg",names,null)); if(error!=null) { result.Map=null; result.Reason=error; } }
            return result;
        }
    }
}
