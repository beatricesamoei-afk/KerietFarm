const feedGrid = document.querySelector("#feed-grid");
const feedMessage = document.querySelector("#feed-message");

async function loadFeed() {
  try {
    const response = await fetch("/api/feed");

    if (!response.ok) {
      throw new Error("The farm feed could not be loaded.");
    }

    const posts = (await response.json()).posts;
    feedGrid.innerHTML = "";

    if (posts.length === 0) {
      feedGrid.innerHTML = "<p>No farm updates yet.</p>";
      return;
    }

    for (const post of posts) {
      const article = document.createElement("article");
      article.className = "feed-card";

      const image = document.createElement("img");
      image.src = post.image;
      image.alt = "";

      const content = document.createElement("div");
      content.className = "feed-content";

      const category = document.createElement("span");
      category.className = "category";
      category.textContent = post.category;

      const title = document.createElement("h2");
      title.textContent = post.title;

      const body = document.createElement("p");
      body.textContent = post.content;

      const date = document.createElement("time");
      date.dateTime = post.createdAt;
      date.textContent = new Date(post.createdAt).toLocaleDateString("en-KE", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });

      content.append(category, title, body, date);
      article.append(image, content);
      feedGrid.append(article);
    }
  } catch (error) {
    feedGrid.innerHTML = "";
    feedMessage.textContent = error.message;
    feedMessage.className = "message error";
    feedMessage.hidden = false;
  }
}

loadFeed();