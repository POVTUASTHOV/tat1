import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data Management System",
  description: "Data management system with file upload and workflow capabilities",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}