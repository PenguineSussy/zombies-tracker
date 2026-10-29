using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using LiveSplit.Model;

namespace LiveSplit.ZombiesTracker
{
    public sealed class RunProfile
    {
        public string game { get; set; }
        public string map { get; set; }
        public string category { get; set; }
        public int players { get; set; }
        public string timing { get; set; }
    }
    public sealed class Checkpoint
    {
        public int index { get; set; }
        public string name { get; set; }
        public long ms { get; set; }
        public long? igtMs { get; set; }
    }
    public sealed class SecondaryTime { public long elapsedMs { get; set; } public List<Checkpoint> splits { get; set; } public SavedRecords records { get; set; } }
    public sealed class Snapshot
    {
        public string[] manualNames { get; set; }
        public string[] autosplitNames { get; set; }
        public string addonVersion { get; set; }
        public SecondaryTime realTime { get; set; }
        public string attemptId { get; set; }
        public int attemptCount { get; set; }
        public bool resetEvent { get; set; }
        public long sequence { get; set; }
        public RunProfile profile { get; set; }
        public string phase { get; set; }
        public int index { get; set; }
        public long elapsedMs { get; set; }
        public long? igtMs { get; set; }
        public string current { get; set; }
        public List<Checkpoint> splits { get; set; }
        public bool complete { get; set; }
        public bool practice { get; set; }
        public bool suppressAlerts { get; set; }
        public long observedAt { get; set; }
        public SavedRecords records { get; set; }
    }
    public sealed class SavedSplit
    {
        public int index { get; set; }
        public string name { get; set; }
        public long? pbSplitMs { get; set; }
        public long? bestSplitMs { get; set; }
        public long? bestSegmentMs { get; set; }
    }
    public sealed class SavedRecords
    {
        public long? pbMs { get; set; }
        public long? pbIgtMs { get; set; }
        public long? pbRealTimeMs { get; set; }
        public List<SavedSplit> splits { get; set; }
    }
    public static class Protocol
    {
        public static string Clean(string value)
        {
            value = Regex.Replace((value ?? "").Normalize().Trim(), @"\s+", " ");
            if (value.Length == 0 || value.Length > 80 || Regex.IsMatch(value, @"[\x00-\x1f<>@]"))
                throw new InvalidOperationException("Use names of 1-80 characters without <, > or @. Rename invalid split names in LiveSplit.");
            return value;
        }
        public static Snapshot Capture(LiveSplitState state, RunProfile profile, string id, long sequence, bool practice, bool suppress)
        {
            bool idle = state.CurrentPhase == TimerPhase.NotRunning;
            var timing = profile.timing=="GameTime"?TimingMethod.GameTime:TimingMethod.RealTime;
            var elapsed = state.CurrentTime[timing];
            if (!idle && !elapsed.HasValue) throw new InvalidOperationException("LiveSplit has no time for the selected timing method.");
            int index = idle ? -1 : state.CurrentSplitIndex;
            if (state.Run.Count > 500 || index > state.Run.Count) throw new InvalidOperationException("Unsupported split count/index (maximum 500).");
            var snapshot = new Snapshot {
                addonVersion = AddonUpdates.InstalledVersion,
                attemptId = id, attemptCount = state.Run.AttemptCount, sequence = sequence, profile = profile, phase = state.CurrentPhase.ToString(), index = index,
                elapsedMs = idle ? 0 : (long)Math.Round(elapsed.Value.TotalMilliseconds), current = null,
                igtMs = idle || !state.IsGameTimeInitialized ? null : Milliseconds(state.CurrentTime.GameTime),
                splits = new List<Checkpoint>(), complete = !idle, practice = practice, suppressAlerts = suppress,
                observedAt = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds
            };
            var unique = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < state.Run.Count; i++)
            {
                string name = Clean(state.Run[i].Name);
                if (!unique.Add(name)) throw new InvalidOperationException("Split names must be unique. Use distinct names for repeated milestones.");
                if (i == index) snapshot.current = name;
                if (i >= index) continue;
                var time = state.Run[i].SplitTime[timing];
                if (time.HasValue) snapshot.splits.Add(new Checkpoint { index = i, name = name, ms = (long)Math.Round(time.Value.TotalMilliseconds), igtMs = state.IsGameTimeInitialized ? Milliseconds(state.Run[i].SplitTime.GameTime) : null });
                else snapshot.complete = false;
            }
            if(timing==TimingMethod.GameTime && state.CurrentTime.RealTime.HasValue) {
                var secondary=new SecondaryTime { elapsedMs=idle?0:(long)Math.Round(state.CurrentTime.RealTime.Value.TotalMilliseconds), splits=new List<Checkpoint>() };
                for(int i=0;i<index;i++) if(state.Run[i].SplitTime.RealTime.HasValue) secondary.splits.Add(new Checkpoint {index=i,name=Clean(state.Run[i].Name),ms=(long)Math.Round(state.Run[i].SplitTime.RealTime.Value.TotalMilliseconds)});
                snapshot.realTime=secondary;
            }
            ValidateCheckpointTimes(snapshot.splits, snapshot.elapsedMs, "primary timer");
            if (snapshot.realTime != null) ValidateCheckpointTimes(snapshot.realTime.splits, snapshot.realTime.elapsedMs, "RTA");
            return snapshot;
        }
        static void ValidateCheckpointTimes(List<Checkpoint> splits, long elapsed, string clock) {
            long previous = -3600000;
            foreach (var split in splits) {
                if (split.ms < previous || split.ms > elapsed || split.ms > 604800000)
                    throw new InvalidOperationException("Waiting for LiveSplit " + clock + " and completed splits to agree. No inconsistent update was queued.");
                previous = split.ms;
            }
        }
        static long? Milliseconds(TimeSpan? value)
        {
            if (!value.HasValue || value.Value.TotalMilliseconds < 0 || value.Value.TotalMilliseconds > 604800000) return null;
            return (long)Math.Round(value.Value.TotalMilliseconds);
        }
        // Read-only equivalent of LiveSplit's Best Split Times history calculation.
        // Never run a comparison generator against the user's live Run: it writes comparisons.
        public static SavedRecords ReadRecords(IRun run, TimingMethod timing = TimingMethod.RealTime)
        {
            var result = new SavedRecords { splits = new List<SavedSplit>(), pbMs = run.Count == 0 ? null : Milliseconds(run[run.Count - 1].PersonalBestSplitTime[timing]), pbRealTimeMs = timing!=TimingMethod.GameTime || run.Count == 0 ? null : Milliseconds(run[run.Count - 1].PersonalBestSplitTime.RealTime), pbIgtMs = timing==TimingMethod.GameTime || run.Count == 0 ? null : Milliseconds(run[run.Count - 1].PersonalBestSplitTime.GameTime) };
            var totals = new Dictionary<int, TimeSpan>();
            for (int i = 0; i < run.Count; i++)
            {
                var segment = run[i];
                long? best = Milliseconds(i == 0 ? segment.BestSegmentTime[timing] : segment.PersonalBestSplitTime[timing]);
                var next = new Dictionary<int, TimeSpan>();
                foreach (var entry in segment.SegmentHistory)
                {
                    TimeSpan total;
                    if (i == 0) total = TimeSpan.Zero;
                    else if (!totals.TryGetValue(entry.Key, out total)) continue;
                    var duration = entry.Value[timing];
                    if (duration.HasValue)
                    {
                        total += duration.Value;
                        var candidate = Milliseconds(total);
                        if (candidate.HasValue && (!best.HasValue || candidate.Value < best.Value)) best = candidate;
                    }
                    next[entry.Key] = total;
                }
                totals = next;
                result.splits.Add(new SavedSplit { index = i, name = Clean(segment.Name), pbSplitMs = Milliseconds(segment.PersonalBestSplitTime[timing]), bestSplitMs = best, bestSegmentMs = Milliseconds(segment.BestSegmentTime[timing]) });
            }
            return result;
        }
    }
}

