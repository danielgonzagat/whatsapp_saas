import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get("email") || "";

    if (!email) {
      return NextResponse.json({ exists: false }, { status: 200 });
    }

    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
    if (!backendUrl) {
      return NextResponse.json(
        { message: "Servidor não configurado corretamente. Contate o suporte." },
        { status: 500 }
      );
    }

    const response = await fetch(
      `${backendUrl}/auth/check-email?email=${encodeURIComponent(email)}`,
      { method: "GET" }
    );

    if (response.ok) {
      const data = await response.json().catch(() => null);
      return NextResponse.json({ exists: !!data?.exists }, { status: 200 });
    }

    const errorText = await response.text().catch(() => "");
    return NextResponse.json(
      { message: errorText || "Falha ao verificar email" },
      { status: response.status }
    );
  } catch (error) {
    console.error("Check email (GET) error:", error);
    return NextResponse.json({ message: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { message: "Email é obrigatório" },
        { status: 400 }
      );
    }

    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
    if (!backendUrl) {
      return NextResponse.json(
        { message: "Servidor não configurado corretamente. Contate o suporte." },
        { status: 500 }
      );
    }

    // Verificar se o email existe no backend
    try {
      const response = await fetch(`${backendUrl}/auth/check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({ exists: data.exists }, { status: 200 });
      }

      const errorText = await response.text().catch(() => "");
      return NextResponse.json(
        { message: errorText || "Falha ao verificar email" },
        { status: response.status }
      );
    } catch (error) {
      console.error("Backend check-email error:", error);
      return NextResponse.json(
        { message: "Serviço indisponível" },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error("Check email error:", error);
    return NextResponse.json({ message: "Erro interno" }, { status: 500 });
  }
}
