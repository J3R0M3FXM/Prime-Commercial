const CATEGORY_PREFIX = "__prime_category__:";

export function videoCategories(video = {}) {
  const values = Array.isArray(video.categories)
    ? video.categories
    : [
        video.category,
        ...(Array.isArray(video.tags)
          ? video.tags
              .filter((tag) => String(tag).startsWith(CATEGORY_PREFIX))
              .map((tag) => tag.slice(CATEGORY_PREFIX.length))
          : []),
      ];
  const seen = new Set();
  return values
    .map((value) =>
      String(value || "")
        .trim()
        .slice(0, 80),
    )
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export function categoryTags(categories, tags = []) {
  return [
    ...tags
      .filter((tag) => !String(tag).startsWith(CATEGORY_PREFIX))
      .map((tag) => String(tag).slice(0, 80))
      .slice(0, 30),
    ...videoCategories({ categories }).map(
      (category) => CATEGORY_PREFIX + category,
    ),
  ];
}

export function publicVideoMetadata(video) {
  return {
    ...video,
    categories: videoCategories(video),
    tags: (Array.isArray(video.tags) ? video.tags : []).filter(
      (tag) => !String(tag).startsWith(CATEGORY_PREFIX),
    ),
  };
}
