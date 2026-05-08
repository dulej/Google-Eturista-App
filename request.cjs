async function run() {
  const r = await fetch('http://0.0.0.0:3000/api/eturista/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Environment': 'test' },
    body: JSON.stringify({ username: "Dusan.jovanovic.nis.95@gmail.com", password: "fk8k?9wW" })
  });
  console.log(r.status);
  console.log(await r.text());
}

run();
