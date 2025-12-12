import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      workspaceName?: string;
    };

    const { name, email, password, workspaceName } = body;

    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      return NextResponse.json(
        { message: "BACKEND_URL não configurado" },
        { status: 500 }
      );
    }

    // Validações básicas
    if (!email || !password) {
      return NextResponse.json(
        { message: "Email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const deriveName = (addr: string) => {
      const localPart = addr.split("@")[0] || "User";
      const cleaned = localPart.replace(/[^\w]+/g, " ").trim();
      const candidate = cleaned || "User";
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    };

    const finalName = (name && name.trim()) || deriveName(email);
    const finalWorkspaceName =
      (workspaceName && workspaceName.trim()) || `${finalName}'s Workspace`;

    if (password.length < 8) {
      return NextResponse.json(
        { message: "A senha deve ter no mínimo 8 caracteres" },
        { status: 400 }
      );
    }

    // Chamar o backend para criar o usuário
    const response = await fetch(`${backendUrl}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
      },
      body: JSON.stringify({
        name: finalName,
        email,
        password,
        workspaceName: finalWorkspaceName,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { message: error.message || "Erro ao criar conta" },
        { status: response.status }
      );
    }

    const user = await response.json();
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { message: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
