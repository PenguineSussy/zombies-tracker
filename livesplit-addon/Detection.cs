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
        public static readonly MapInfo[] Maps = {
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
        static List<MapInfo> Matches(IEnumerable<string> texts, bool shortNames)
        {
            return Maps.Where(m => m.Aliases.Any(a => (shortNames || Normalize(a).Length > 3) && texts.Any(t => Has(t, a)))).ToList();
        }
        static Detection Resolve(List<MapInfo> maps, string source)
        {
            if (maps.Count > 1) return new Detection { Reason = "Conflicting maps in " + source + ": " + string.Join(", ", maps.Select(m => m.Name)) };
            if (maps.Count == 1) return maps[0].Enabled ? new Detection { Map = maps[0].Id, Reason = maps[0].Name + " detected from " + source }
                : new Detection { Reason = maps[0].Name + " is disabled on this tracker." };
            return null;
        }
        public static Detection Detect(string game, string category, string fileTitle, IDictionary<string, string> variables, IEnumerable<string> splits, string manualMap)
        {
            var names = splits.ToArray();
            var primary = new List<string> { game, category, fileTitle };
            foreach (var item in variables)
                if (Has(item.Key, "map") || Has(item.Key, "category")) primary.Add(item.Value);
            Detection result;
            if (!string.IsNullOrWhiteSpace(manualMap))
            {
                var m = Maps.FirstOrDefault(x => x.Id == manualMap && x.Enabled);
                result = new Detection { Map = m == null ? null : m.Id, Reason = m == null ? "Invalid map override." : m.Name + " (manual override)" };
            }
            else
            {
                if (!string.IsNullOrWhiteSpace(game) && !Has(game, "Black Ops 3") && !Has(game, "Black Ops III") && !Has(game, "BO3"))
                    return new Detection { Reason = "Game is not labeled Black Ops 3 / Black Ops III / BO3. Correct Edit Splits, or explicitly choose a map override." };
                result = Resolve(Matches(primary, true), "game/category, map variable, or split-file name");
                if (result == null) result = Resolve(Matches(names, false), "split names");
                if (result == null)
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
                if (result == null) result = new Detection { Reason = "Map unknown. Include the map in Edit Splits > Category Name or the .lss filename, or choose an override." };
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
            return result;
        }
    }
}
