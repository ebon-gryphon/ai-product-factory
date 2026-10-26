window.notes.list().then((notes) => {
  document.querySelector('p').textContent = notes.map((note) => note.text).join(', ');
});
