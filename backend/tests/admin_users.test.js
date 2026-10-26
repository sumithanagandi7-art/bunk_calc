import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:4000/api/v1/admin';

test('Admin User Management: Full CRUD and Lifecycle', async (t) => {
  const testCode = `TEST-${Date.now().toString().slice(-5)}`;
  const editedCode = `${testCode}-EDIT`;
  let createdUserId = '';

  await t.test('1. List users initially', async () => {
    const res = await fetch(`${BASE_URL}/users`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.users));
  });

  await t.test('2. Add new user', async () => {
    const res = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_code: testCode,
        name: 'Automated Test User',
        email: 'testuser@example.com',
        role: 'student',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.user.access_code, testCode);
    assert.equal(body.user.name, 'Automated Test User');
    assert.equal(body.user.email, 'testuser@example.com');
    assert.ok(body.token);
    createdUserId = body.user.workspace_id;
  });

  await t.test('3. Prevent duplicate access code creation', async () => {
    const res = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_code: testCode,
      }),
    });
    assert.equal(res.status, 409);
  });

  await t.test('4. Get user details by identifier', async () => {
    const res = await fetch(`${BASE_URL}/users/${testCode}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.user.access_code, testCode);
    assert.equal(body.user.workspace_id, createdUserId);
    assert.ok(Array.isArray(body.subjects));
  });

  await t.test('5. Edit user details and access code', async () => {
    const res = await fetch(`${BASE_URL}/users/${testCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_code: editedCode,
        name: 'Updated Name',
        email: 'updated@example.com',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.user.access_code, editedCode);
    assert.equal(body.user.name, 'Updated Name');
    assert.equal(body.user.email, 'updated@example.com');
  });

  await t.test('6. Generate impersonation token for user', async () => {
    const res = await fetch(`${BASE_URL}/users/${editedCode}/token`, {
      method: 'POST',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.token);
  });

  await t.test('7. Reset user data', async () => {
    const res = await fetch(`${BASE_URL}/users/${editedCode}/reset`, {
      method: 'POST',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.user.access_code, editedCode);
  });

  await t.test('8. Delete user by identifier and vacuum database', async () => {
    const res = await fetch(`${BASE_URL}/users/${editedCode}`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.deleted_user.access_code, editedCode);

    // Verify user is gone
    const verifyRes = await fetch(`${BASE_URL}/users/${editedCode}`);
    assert.equal(verifyRes.status, 404);
  });

  await t.test('9. Bulk delete users', async () => {
    // Create 2 temporary users
    const u1 = `BULK1-${Date.now().toString().slice(-4)}`;
    const u2 = `BULK2-${Date.now().toString().slice(-4)}`;

    await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_code: u1 }),
    });

    await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_code: u2 }),
    });

    const bulkRes = await fetch(`${BASE_URL}/users/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: [u1, u2] }),
    });

    assert.equal(bulkRes.status, 200);
    const bulkBody = await bulkRes.json();
    assert.equal(bulkBody.success, true);
    assert.equal(bulkBody.deleted_count, 2);
  });
});
