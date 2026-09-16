import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs dan unpdf memakai API Node murni; biarkan tetap eksternal agar
  // bundler tidak mencoba mem-polyfill-nya untuk runtime edge.
  serverExternalPackages: ["exceljs", "unpdf"],
};

export default nextConfig;
