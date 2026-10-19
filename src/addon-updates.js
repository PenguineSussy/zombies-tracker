// Change these only when a tested addon release is publicly available.
export const addonRelease = Object.freeze({latestVersion:'1.0.8',minimumVersion:'0.2.7',downloadUrl:'https://doctormonty.beer/downloads/Zombies-Tracker-LiveSplit.zip',message:'Split aliases automatically follow your loaded map while preserving existing mappings. Categories are filtered to the selected or detected game and map.'});
export const validAddonVersion = v => typeof v==='string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v);
export function compareVersions(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;}
export function addonStatus(player){const installed=player.addon?.version;return {...addonRelease,installedVersion:installed??null,lastReportedAt:player.addon?.reportedAt??null,state:!validAddonVersion(installed)?'unknown':compareVersions(installed,addonRelease.minimumVersion)<0?'required':compareVersions(installed,addonRelease.latestVersion)<0?'available':'current'};}

