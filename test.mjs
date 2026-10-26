import { search } from './src/worker.js';
import worker from './src/worker.js';
import { DRUGS } from './src/drugs.js';
const name = (r) => r.exact ? 'EXACT ' + r.exact.map(i => DRUGS[i].n).join(' | ') : 'SUGGEST ' + r.suggest.map(i => DRUGS[i].n).join(' | ');
const qs = ['paracetamol','PANADOL','panadol extra','Augmentin','co-amoxiclav','amoxicilin','amoxi','ACETAMINOPHEN','epinephrine','adrenaline',
 'Lasix','furosemid','metformine','glucophage','insulin','vitamin d','omeprazol','Nexium','ceftriaxon','Rocephin','mgso4','normal saline','Symbicort',
 'amlodipine 5mg','xyz','a','Concor','zithromax','Flagyl','voltaren','brufen','augmantin','losec','ventolin','Lantus','warfarine','clexane','Plavix'];
let worst=0;
for (const q of qs) { const t=performance.now(); const r=search(q); const ms=performance.now()-t; worst=Math.max(worst,ms); console.log(q.padEnd(16), name(r)); }
console.log('worst ms', worst.toFixed(2));
// timing over many random typo queries
const words=['amoxicilin','paracetamoll','ibuprofin','ceftriaxzone','metformn','omeprazle','hydrocortizone','salbutamoll','zzzzzzzzzzzz','xa','dexametasone','enoxaparine'];
let t=performance.now(); for (let r=0;r<50;r++) for (const w of words) search(w); console.log('avg ms per search', ((performance.now()-t)/(50*words.length)).toFixed(3));

await import('./test2.mjs');
