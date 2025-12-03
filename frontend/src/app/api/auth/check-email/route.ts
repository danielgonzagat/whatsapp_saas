import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { message: "Email é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se o email existe no backend
    try {
      const response = await fetch(`${process.env.BACKEND_URL}/auth/check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({ exists: data.exists }, { status: 200 });
      }
    } catch (error) {
      // Se o backend não responder, assume que o usuário não existe
      console.error("Backend check-email error:", error);
    }

    // Default: assume que não existe (vai para registro)
    return NextResponse.json({ exists: false }, { status: 200 });
  } catch (error) {
    console.error("Check email error:", error);
    return NextResponse.json({ exists: false }, { status: 200 });
  }
}
