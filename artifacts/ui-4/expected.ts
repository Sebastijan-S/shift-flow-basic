import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {generateSchedule,missingRequirements,validateSchedule,hoursFor,type Workspace} from '../../src/lib/scheduler';
const fixture=JSON.parse(readFileSync('artifacts/ui-4/fixture.json','utf8')) as {current:Workspace};
const w=fixture.current,week=Object.keys(w.schedules)[0];
w.schedules[week].assignments[0].locked=true;w.schedules[week].assignments[0].note='Sačuvaj dogovor';
const start=performance.now();
const first=generateSchedule(w,week,true,101),second=generateSchedule(w,week,true,202),unlocked=generateSchedule(w,week,false,101);
writeFileSync('artifacts/ui-4/expected.json',JSON.stringify({first,second,unlocked},null,2));
const signatures=new Set(),metrics=[];
for(const seed of [0,1,2,3,4,5,6,7,8,9,10,11]){
const begin=performance.now(),s=generateSchedule(w,week,true,seed);
signatures.add(JSON.stringify(s.assignments.map(a=>[a.day,a.templateId,a.position,a.employeeId]).sort()));
metrics.push({seed,missing:missingRequirements(s.assignments,s.requirements!).reduce((n,r)=>n+r.missing,0),blocking:validateSchedule(s,w).filter(c=>c.severity==='block').length,hours:w.employees.map(e=>hoursFor(s.assignments,e.id,w.templates)),ms:Math.round(performance.now()-begin)});
}
writeFileSync('artifacts/ui-4/metrics.json',JSON.stringify({uniqueSchedules:signatures.size,seeds:metrics.length,totalMs:Math.round(performance.now()-start),metrics},null,2));
console.log('first and second differ:',JSON.stringify(first)!==JSON.stringify(second),'; distinct schedules:',signatures.size);
