import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const PortalParserV1 = require('../../extension/parsers/portalParserV1.js');

test('PortalParserV1 correctly maps columns by header and does not take min/max of all numbers', () => {
  // Mock document with a Contineo ERP table
  const mockRows = [
    {
      innerText: 'Sl No\tCourse Code\tCourse Name\tConducted\tAttended\tPercentage',
      querySelectorAll: () => [
        { innerText: 'Sl No' },
        { innerText: 'Course Code' },
        { innerText: 'Course Name' },
        { innerText: 'Conducted' },
        { innerText: 'Attended' },
        { innerText: 'Percentage' },
      ],
    },
    {
      innerText: '1\t22CS51\tComputer Networks\t32\t28\t87%',
      querySelectorAll: () => [
        { innerText: '1' },
        { innerText: '22CS51' },
        { innerText: 'Computer Networks' },
        { innerText: '32' },
        { innerText: '28' },
        { innerText: '87%' },
      ],
    },
  ];

  const mockDoc = {
    querySelectorAll: (selector) => {
      if (selector === 'table') {
        return [
          {
            querySelectorAll: (subSelector) => {
              if (subSelector === 'tr') return mockRows;
              return [];
            },
          },
        ];
      }
      return [];
    },
  };

  const result = PortalParserV1.parseContineoERP(mockDoc);
  assert.equal(result.success, true);
  assert.equal(result.subjects.length, 1);

  const sub = result.subjects[0];
  assert.equal(sub.subject_code, '22CS51');
  assert.equal(sub.presents, 28, 'Presents must be 28 (attended), not 1 (serial number)');
  assert.equal(sub.absents, 4, 'Absents must be 32 - 28 = 4');
  assert.equal(sub.total_classes_planned, 40, 'Planned classes must be at least 40 or conducted');
});
