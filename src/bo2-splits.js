// T6-EE-Timer a030b826284aa1030b566391526df233e931a4dc.
// Solo only. TCP split events do not transmit these labels; recognize LiveSplit
// names and explicit aliases. Do not infer a layout from elapsed time.
const normalize=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const split=(name,aliases=[])=>({name,aliases:[name,...aliases].map(normalize)});
const staff=i=>split(`Staff ${i}`,[`Staff ${['I','II','III','IV'][i-1]}`,`staff_${i}`]);
export const BO2_SPLITS={
 'bo2-tranzit':{
  Richtofen:[split('Jetgun',['Jetgun/Power off','Jetgun / Power off','jetgun_power_off']),split('Tower',['Tower / Turbines']),split('End',['Lights','EMP','EMP (Richtofen)','Complete'])],
  Maxis:[split('Power off',['Jetgun/Power off','Jetgun / Power off','jetgun_power_off']),split('End',['Turbines','Tower / Turbines','Complete'])]
 },
 'bo2-die-rise':[split('Symbols',['highrise_symbols']),split('End',['High Maintenance','highrise_perks','Complete'])],
 'bo2-mob-of-the-dead':[split('Dryer'),...['1','2','3'].flatMap((i,index)=>[split(`Gondola ${i}`,[`Gondola ${['I','II','III'][index]}`,`gondola_${i}`]),split(`Fly ${i}`,[`Flight ${i}`,`Flight ${['I','II','III'][index]}`,`Fly ${['I','II','III'][index]}`,`Plane ${i}`,`Plane ${['I','II','III'][index]}`,`plane_${i}`])]),split('Codes'),split('End',['Headphones','Complete'])],
 'bo2-buried':[split('Boxhit',['Box hit']),split('Ghosts'),split('Cipher'),split('Time Travel',['time_travel']),split('End',['Sharpshooter','Complete'])],
 'bo2-origins':[split("No Man's Land",['NML']),split('Chests Filled',['Boxes']),...[1,2,3,4].map(staff),split('Ascend from Darkness',['AFD']),split('Rain Fire',['rain_fire']),split('End',['Freedom','Complete'])]
};
export function bo2Splits(profile){
 const entry=BO2_SPLITS[profile?.map];
 if(!entry)return [];
 if(Array.isArray(entry))return entry;
 const side=/\bMaxis\b/i.test(profile.category)?'Maxis':/\bRichtofen\b/i.test(profile.category)?'Richtofen':null;
 return side?entry[side]:[];
}
