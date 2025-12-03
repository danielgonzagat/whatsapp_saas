import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json();

    if (!phone || !code) {
      return NextResponse.json(
        { message: "Telefone e código são obrigatórios" },
        { status: 400 }
      );
    }

    // Normalizar número de telefone
    const normalizedPhone = phone.replace(/\D/g, "");

    // Verificar código no backend
    const verifyResponse = await fetch(
      `${process.env.BACKEND_URL}/auth/whatsapp/verify-code`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, code }),
      }
    );

    if (!verifyResponse.ok) {
      return NextResponse.json(
        { message: "Código inválido ou expirado" },
        { status: 400 }
      );
    }

    const data = await verifyResponse.json();

    // Se o usuário não existe, criar novo usuário
    if (!data.user) {
      const createResponse = await fetch(
        `${process.env.BACKEND_URL}/auth/whatsapp/create-user`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: normalizedPhone }),
        }
      );

      if (!createResponse.ok) {
        return NextResponse.json(
          { message: "Erro ao criar usuário" },
          { status: 500 }
        );
      }

      const newUser = await createResponse.json();
      data.user = newUser;
    }

    // Gerar token de sessão
    const sessionResponse = await fetch(
      `${process.env.BACKEND_URL}/auth/session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id }),
      }
    );

    if (!sessionResponse.ok) {
      return NextResponse.json(
        { message: "Erro ao criar sessão" },
        { status: 500 }
      );
    }

    const session = await sessionResponse.json();

    // Definir cookie de sessão
    const cookieStore = await cookies();
    cookieStore.set("session-token", session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 dias
      path: "/",
    });

    return NextResponse.json(
      { message: "Verificação bem-sucedida", user: data.user },
      { status: 200 }
    );
  } catch (error) {
    console.error("WhatsApp verify error:", error);
    return NextResponse.json(
      { message: "Erro ao verificar código" },
      { status: 500 }
    );
  }
}
