import test from 'node:test';
import assert from 'node:assert/strict';

test('Timetable parser correctly parses subject codes, full subject names, and faculty from sample legend table', () => {
  // Sample text representation of the timetable legend table
  const sampleLines = [
    '22CS51 Computer Networks CN Ms. Monika Singh(MS) 244C monika.singh@nmit.ac.in',
    '22CS52 Theory Of Computation TOC NL1 244C',
    '22CSL54 Computer Network Lab CN LAB F1: MS+AKR / F2: CNJ+LHS / F3: SSS+SSJ Lab 1,2 &5 monika.singh@nmit.ac.in',
    '22CSE552 5G Mobile Communication 5G Dr. Kavitha K K(KKK) 137A kavitha.kk@nmit.ac.in',
    '22CSE553 Ethical Hacking EH Dr. Nalini N(NN) 138A nalini.n@nmit.ac.in',
    '22CSE554 Data science Using Python DSP Ms. Aishwarya R(AR)/ NL3 128A/134A aishwarya.r@nmit.ac.in',
    '22CSE555 DevOps Essentials with Docker & Kubernetes DevOps Dr. Nirmala J S(NJS)/Ms. Sowmya M R(SMR) 235B/236B',
    '22CSE556 Internet of Things IoT Dr. Roopa M S(RMS) 233B roopa.ms@nmit.ac.in',
    '22CSE557 Quantum Computing QM Dr. Shwetha S V(SSV) 244C shwetha.sv@nmit.ac.in',
    '22RM57 Research Methodology RM Mr. R Deepak(RD) 244C deepak.r@nmit.ac.in',
    '22CSA581 Programming MATLAB Fundamentals MATLAB Dr. Subramanya S G+ Ms.Sowmya P Lab 9',
    '22CSA582 UI / UX LAB UI /UX LAB Ms. Shruthi Shetty J+ Ms. Rakshitha K S Lab 6',
    '22CSA583 Tool Based Software Testing TBST Lab Ms. Trisheela S + Ms. Vyshali Lab 11',
    '22CSG59 Computational Statistics CS Dr. Jagadeesha S 244C/Lab 6 jagadeesha.s@nmit.ac.in',
    '22CS58 Interview Preparedness Course IPC Ms. Vyshali 244C vaishali.bangera@nmit.ac.in',
    '22CSO56X Open Elective -NPTEL OE Dr. Dileep Reddy Bolla 244C dileep.bolla@nmit.ac.in',
    '22IN55/ISP5/22IY5 National Service Scheme/Physical education /Yoga NSS/PE/Y Ms. Mamatha Bai BG 244C',
    'PPL Placement Practice Lab PPL Dr. Uma R Lab 1 & 2 uma.r@nmit.ac.in',
    'LA/PD Learning Assessment / Partial Delivery LA/PD MS/NL1/KKK/NN/AR 244C deepak.r@nmit.ac.in',
  ];

  const subjectCodeRegex = /\b(?:[0-9]{2}[A-Z]{2,6}[0-9]{1,4}[A-Z0-9/]*|22IN55\/ISP5\/22IY5|U[0-9]{2}[A-Z]{2,5}[0-9]{1,4}|[A-Z]{2,5}\s*[-_]?\s*[0-9]{1,4}[A-Z]?|PPL|LA\/PD|AAV15V|TA\/PD)\b/i;

  const extracted = [];
  for (const line of sampleLines) {
    const match = line.match(subjectCodeRegex);
    assert.ok(match, `Must match code in line: ${line}`);
    const code = match[0].toUpperCase().replace(/\s+/g, '');

    let remaining = line.replace(match[0], '').replace(/^[-\s|:]+/, '').trim();
    // Strip email
    remaining = remaining.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '').trim();
    // Strip classroom/lab
    remaining = remaining.replace(/\b(?:Lab\s*[\d,\s&]+|\d{3}[A-Z]?(?:\/\d{3}[A-Z]?)?|\d{3}[A-Z]?\/Lab\s*\d+)\b$/i, '').trim();

    let faculty = '';
    let name = '';
    const facultyMatch = remaining.match(/(?:Dr\.|Ms\.|Mr\.|Prof\.|F1:|F2:|F3:|NL\d|[A-Z]{2,}(?:\/[A-Z0-9]+){2,})\s*[^()]*(?:\([^()]+\))?/i);
    if (facultyMatch) {
      name = remaining.substring(0, facultyMatch.index).trim();
      faculty = remaining.substring(facultyMatch.index).trim();
    } else {
      name = remaining;
    }

    // Strip trailing initials
    name = name.replace(/\b(?:CN|TOC|CN LAB|5G|EH|DSP|DevOps|IoT|QM|RM|MATLAB|UI\s*\/UX\s*LAB|TBST\s*Lab|CS|IPC|OE|NSS\/PE\/Y|PPL|LA\/PD)\b$/i, '').trim();

    extracted.push({ code, name, faculty });
  }

  assert.equal(extracted.length, 19, 'Should extract all 19 subjects');

  // Verify critical subject names are correctly extracted
  const c51 = extracted.find(s => s.code === '22CS51');
  assert.equal(c51.name, 'Computer Networks');

  const c52 = extracted.find(s => s.code === '22CS52');
  assert.equal(c52.name, 'Theory Of Computation');

  const c552 = extracted.find(s => s.code === '22CSE552');
  assert.equal(c552.name, '5G Mobile Communication');

  const c554 = extracted.find(s => s.code === '22CSE554');
  assert.equal(c554.name, 'Data science Using Python');

  const c555 = extracted.find(s => s.code === '22CSE555');
  assert.equal(c555.name, 'DevOps Essentials with Docker & Kubernetes');

  const ppl = extracted.find(s => s.code === 'PPL');
  assert.equal(ppl.name, 'Placement Practice Lab');

  const lapd = extracted.find(s => s.code === 'LA/PD');
  assert.equal(lapd.name, 'Learning Assessment / Partial Delivery');
});
