import {check} from './domain.js';

export function streamLink(value, platform) {
  if (!value?.trim()) return null;
  let url; try { url = new URL(value.trim()); } catch { check(false, 'Enter a full HTTPS stream URL.'); }
  check(url.protocol === 'https:' && !url.username && !url.password && !url.port, 'Use an HTTPS Twitch or YouTube URL.');
  const host = url.hostname.toLowerCase(), parts = url.pathname.split('/').filter(Boolean);
  if (platform === 'twitch') {
    check(['twitch.tv','www.twitch.tv'].includes(host) && parts.length === 1 && /^[a-zA-Z0-9_]{3,25}$/.test(parts[0]), 'Enter a Twitch channel URL, such as https://www.twitch.tv/name.');
    check(!['directory','videos','downloads','settings','subscriptions'].includes(parts[0].toLowerCase()), 'Enter a Twitch channel, not a Twitch site page.');
    const channel = parts[0].toLowerCase();
    return {platform, channel, url:`https://www.twitch.tv/${channel}`};
  }
  check(platform === 'youtube', 'Unknown streaming platform.');
  let videoId;
  if (host === 'youtu.be' && parts.length === 1) videoId = parts[0];
  if (['youtube.com','www.youtube.com','m.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v');
    if (['live','embed'].includes(parts[0]) && parts.length === 2) videoId = parts[1];
  }
  check(/^[\w-]{11}$/.test(videoId??''), 'Use the specific YouTube broadcast URL (watch?v=… or /live/…), not a channel link.');
  return {platform, videoId, url:`https://www.youtube.com/watch?v=${videoId}`};
}

export function publicStreams(player, now) {
  if (!player.public || !player.streams) return null;
  const fresh=player.streamStatus?.checkedAt > now-120000 && player.streamStatus?.channel===player.streams.twitch?.channel;
  return {...player.streams, twitchStatus:fresh?player.streamStatus.status:'unknown', youtubeLive:player.streams.liveUntil > now};
}
