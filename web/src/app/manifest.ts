import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "شركة مكتسبات العقارية | Muktasabat Real Estate",
    short_name: "مكتسبات",
    description: "عقارات للإيجار والبيع وتسويق عقاري وإدارة أملاك — Property for rent & sale, marketing and property management.",
    start_url: "/ar",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7b1a1a",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
