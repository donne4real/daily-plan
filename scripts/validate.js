#!/usr/bin/env node
/**
 * Validates data/tasks.json before deploy. Runs as the Netlify build command,
 * so a malformed week file blocks the deploy instead of shipping a broken site.
 * Exit code 1 on any error.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'tasks.json');
const errors = [];

function fail(msg) { errors.push(msg); }

let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`✗ Cannot parse ${file}: ${e.message}`);
  process.exit(1);
}

// --- top level ---
if (data.schemaVersion !== 1) fail(`schemaVersion must be 1, got ${data.schemaVersion}`);
for (const key of ['week', 'days', 'standingDailies', 'adminItems', 'deadlines', 'reminders', 'risks']) {
  if (!(key in data)) fail(`missing top-level key "${key}"`);
}
if (!Array.isArray(data.days) || data.days.length !== 7) fail(`days must be an array of 7, got ${data.days?.length}`);

// --- week ---
const w = data.week || {};
for (const key of ['id', 'label', 'startDate', 'planVersion', 'context', 'lookingAhead']) {
  if (!w[key]) fail(`week.${key} is required`);
}

// --- days: contiguous dates, correct dow, unique task ids ---
const seenTaskIds = new Set();
const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00').getTime());

let prev = null;
for (const [i, day] of (data.days || []).entries()) {
  if (!dateOk(day.date)) { fail(`days[${i}].date invalid: ${day.date}`); continue; }
  const d = new Date(day.date + 'T00:00:00');
  if (day.dow !== d.getDay()) fail(`days[${i}] (${day.date}) dow=${day.dow} but real dow is ${d.getDay()}`);
  if (prev) {
    const diff = Math.round((d - prev) / 86400000);
    if (diff !== 1) fail(`days[${i}] (${day.date}) is not the day after ${data.days[i - 1].date}`);
  }
  prev = d;
  if (!day.label) fail(`days[${i}].label required`);
  for (const [j, t] of (day.tasks || []).entries()) {
    if (!t.id) fail(`days[${i}].tasks[${j}].id required`);
    if (!t.title) fail(`days[${i}].tasks[${j}] (${t.id}) title required`);
    if (!t.category) fail(`days[${i}].tasks[${j}] (${t.id}) category required`);
    if (seenTaskIds.has(t.id)) fail(`duplicate task id "${t.id}"`);
    seenTaskIds.add(t.id);
    if (t.sort && !/^\d{2}:\d{2}$/.test(t.sort)) fail(`task "${t.id}" sort must be HH:MM, got "${t.sort}"`);
  }
  if (day.callout) {
    if (!day.callout.title || !day.callout.body) fail(`days[${i}].callout needs title and body`);
    if (!Array.isArray(day.callout.options) || !day.callout.options.length) fail(`days[${i}].callout needs options`);
    day.callout.options.forEach((o, k) => {
      if (!o.label || !o.detail) fail(`days[${i}].callout.options[${k}] needs label and detail`);
    });
  }
}
if (data.days?.length && data.days[0].date !== w.startDate) fail(`week.startDate (${w.startDate}) must equal days[0].date (${data.days[0]?.date})`);

// --- standing dailies ---
const seenDailyIds = new Set();
for (const [i, dl] of (data.standingDailies || []).entries()) {
  if (!dl.id) fail(`standingDailies[${i}].id required`);
  if (seenDailyIds.has(dl.id)) fail(`duplicate daily id "${dl.id}"`);
  seenDailyIds.add(dl.id);
  if (!dl.title) fail(`standingDailies[${i}] (${dl.id}) title required`);
  if (!Array.isArray(dl.days) || !dl.days.length || !dl.days.every(n => Number.isInteger(n) && n >= 0 && n <= 6)) {
    fail(`standingDailies[${i}] (${dl.id}) days must be a non-empty array of ints 0–6`);
  }
  if (!dl.category) fail(`standingDailies[${i}] (${dl.id}) category required`);
  if (dl.sort && !/^\d{2}:\d{2}$/.test(dl.sort)) fail(`daily "${dl.id}" sort must be HH:MM, got "${dl.sort}"`);
}

// --- admin ---
for (const [i, a] of (data.adminItems || []).entries()) {
  if (!a.id || !a.title || !a.category) fail(`adminItems[${i}] needs id, title, category`);
  if (seenTaskIds.has(a.id)) fail(`admin id "${a.id}" collides with a task id`);
  seenTaskIds.add(a.id);
}

// --- deadlines ---
for (const [i, dl] of (data.deadlines || []).entries()) {
  if (!dateOk(dl.date)) fail(`deadlines[${i}].date invalid: ${dl.date}`);
  if (!dl.label) fail(`deadlines[${i}].label required`);
  if (!['hard', 'info'].includes(dl.severity)) fail(`deadlines[${i}].severity must be "hard" or "info", got "${dl.severity}"`);
}

// --- strings ---
if (data.reminders?.some(r => typeof r !== 'string')) fail('reminders must be strings');
if (data.risks?.some(r => typeof r !== 'string')) fail('risks must be strings');

// --- summary ---
console.log(`Week ${w.label} (${w.id})`);
for (const day of data.days || []) {
  const dailies = (data.standingDailies || []).filter(dl => dl.days.includes(day.dow)).length;
  console.log(`  ${day.label}: ${day.tasks?.length || 0} tasks + ${dailies} dailies${day.special === 'free' ? ' · FREE DAY' : ''}${day.callout ? ' · callout' : ''}`);
}
console.log(`  ${data.standingDailies?.length || 0} standing dailies · ${data.adminItems?.length || 0} admin items · ${data.deadlines?.length || 0} deadlines`);

if (errors.length) {
  console.error(`\n✗ ${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✓ tasks.json valid');
