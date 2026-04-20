import type { MetadataRoute } from "next";

const BASE = "https://visitportal.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${BASE}/`, lastModified, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/docs`, lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/bench`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/directory`, lastModified, changeFrequency: "weekly", priority: 0.7 },
  ];
}
