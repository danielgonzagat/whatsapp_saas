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
          backgroundColor: "#0A0A0F",
          margin: 0,
          padding: 0,
          minHeight: "100vh",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "#F5F5F5",
        }}
      >
        {children}
      </body>
    </html>
  );
}
