const grid = document.querySelector("#feed-grid");
async function loadFeed() {
  const response = await fetch("/api/feed");
  const result = await response.json();
  grid.innerHTML = "";
  for (const post of result.posts) {
    const article = document.createElement("article");
    article.className = "feed-card";
    article.innerHTML = `
      <img src="${post.image}" alt="">
      <div>
        <span class="badge">${post.category}</span>
        <h2>${post.title}</h2>
        <p>${post.content}</p>
        <time>${new Date(post.createdAt).toLocaleDateString("en-KE")}</time>
      </div>
    `;
    grid.append(article);
  }
}
loadFeed();