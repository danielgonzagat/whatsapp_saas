import "@/app/globals.css";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          backgroundColor: "#FAFAFA",
          margin: 0,
          padding: 0,
          minHeight: "100vh",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "#1A1A1A",
        }}
      >
        {children}
      </body>
    </html>
  );
}
