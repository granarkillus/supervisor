import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // This site moved into portal.xing.wtf/supervisor. Old links and bookmarks
  // (including ?id= links sent to officers) land on the same page there.
  async redirects() {
    return [
      { source: "/", destination: "https://portal.xing.wtf/supervisor", permanent: false },
      { source: "/:path*", destination: "https://portal.xing.wtf/supervisor/:path*", permanent: false },
    ];
  },
};
export default nextConfig;
