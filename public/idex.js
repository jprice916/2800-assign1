
async function submit() {

  const collection = db.collection('users');

  const user = {
    name: document.getElementById('name'),
    password: document.getElementById('pass'),
    email: document.getElementById('email')
  };

  fetch('/addUser', {
      method: 'POST',
      headers: {
      'Content-Type': 'application/json'
    },
  body: JSON.stringify("user")})




}

app.listen(port, () => {
  console.log("Server runs on http://localhost:${port}")
});