import {
  BadRequestException,
  Controller,
  Logger,
  NotFoundException,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { forEachSequential } from '../common/async-sequence';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { PrismaService } from '../prisma/prisma.service';
import { serializeArea } from './member-area.helpers';

interface ModuleTemplateLesson {
  name: string;
  type: string;
  position: number;
}

interface ModuleTemplate {
  name: string;
  description: string;
  position: number;
  lessons: ModuleTemplateLesson[];
}

const COURSE_MODULES: ModuleTemplate[] = [
  {
    name: 'Fundamentos',
    description: 'Base teorica e conceitos essenciais',
    position: 0,
    lessons: [
      { name: 'Introducao ao Curso', type: 'VIDEO', position: 0 },
      { name: 'Conceitos Basicos', type: 'VIDEO', position: 1 },
      { name: 'Ferramentas Necessarias', type: 'TEXT', position: 2 },
      { name: 'Quiz - Fundamentos', type: 'QUIZ', position: 3 },
    ],
  },
  {
    name: 'Estrategia',
    description: 'Planejamento e estrategias avancadas',
    position: 1,
    lessons: [
      { name: 'Definindo Objetivos', type: 'VIDEO', position: 0 },
      { name: 'Analise de Mercado', type: 'VIDEO', position: 1 },
      { name: 'Plano de Acao', type: 'TEXT', position: 2 },
      { name: 'Quiz - Estrategia', type: 'QUIZ', position: 3 },
    ],
  },
  {
    name: 'Execucao',
    description: 'Colocando em pratica tudo que aprendeu',
    position: 2,
    lessons: [
      { name: 'Primeiro Passo', type: 'VIDEO', position: 0 },
      { name: 'Otimizacao', type: 'VIDEO', position: 1 },
      { name: 'Estudo de Caso', type: 'VIDEO', position: 2 },
      { name: 'Projeto Final', type: 'TEXT', position: 3 },
    ],
  },
];

const COMMUNITY_MODULES: ModuleTemplate[] = [
  {
    name: 'Comunidade',
    description: 'Espaco de discussao e networking',
    position: 0,
    lessons: [
      { name: 'Boas-vindas e Regras', type: 'TEXT', position: 0 },
      { name: 'Apresente-se', type: 'TEXT', position: 1 },
      { name: 'Duvidas e Suporte', type: 'TEXT', position: 2 },
    ],
  },
];

const HYBRID_MODULES: ModuleTemplate[] = [
  ...COURSE_MODULES,
  { ...COMMUNITY_MODULES[0], position: 3 },
];

const MEMBERSHIP_MODULES: ModuleTemplate[] = [
  {
    name: 'Semana 1 - Inicio',
    description: 'Conteudo da primeira semana',
    position: 0,
    lessons: [
      { name: 'Video da Semana', type: 'VIDEO', position: 0 },
      { name: 'Material Complementar', type: 'TEXT', position: 1 },
      { name: 'Atividade Pratica', type: 'TEXT', position: 2 },
    ],
  },
  {
    name: 'Semana 2 - Aprofundamento',
    description: 'Conteudo da segunda semana',
    position: 1,
    lessons: [
      { name: 'Video da Semana', type: 'VIDEO', position: 0 },
      { name: 'Material Complementar', type: 'TEXT', position: 1 },
      { name: 'Atividade Pratica', type: 'TEXT', position: 2 },
    ],
  },
  {
    name: 'Semana 3 - Pratica',
    description: 'Conteudo da terceira semana',
    position: 2,
    lessons: [
      { name: 'Video da Semana', type: 'VIDEO', position: 0 },
      { name: 'Material Complementar', type: 'TEXT', position: 1 },
      { name: 'Atividade Pratica', type: 'TEXT', position: 2 },
    ],
  },
  {
    name: 'Semana 4 - Consolidacao',
    description: 'Conteudo da quarta semana',
    position: 3,
    lessons: [
      { name: 'Video da Semana', type: 'VIDEO', position: 0 },
      { name: 'Material Complementar', type: 'TEXT', position: 1 },
      { name: 'Revisao e Proximos Passos', type: 'TEXT', position: 2 },
    ],
  },
];

function templateForAreaType(type: string): ModuleTemplate[] {
  if (type === 'COURSE') return COURSE_MODULES;
  if (type === 'COMMUNITY') return COMMUNITY_MODULES;
  if (type === 'HYBRID') return HYBRID_MODULES;
  if (type === 'MEMBERSHIP') return MEMBERSHIP_MODULES;
  return [];
}

/**
 * MEMBER STRUCTURE CONTROLLER — AI-assisted module scaffolding
 *
 * Hosts the single `POST /member-areas/:id/generate-structure` endpoint, which
 * populates a freshly created area with a template module + lesson tree chosen
 * from the area's declared type. Kept in its own controller because the
 * template catalog dominates the file's line count and doesn't share state
 * with the CRUD endpoints.
 */
@Controller('member-areas')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MemberStructureController {
  private readonly logger = new Logger(MemberStructureController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a template structure based on area type
   */
  @Post(':id/generate-structure')
  async generateStructure(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;

    const area = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    if (!area) {
      throw new NotFoundException('Member area not found');
    }

    const existingModules = await this.prisma.memberModule.count({
      where: { memberAreaId: id },
    });

    if (existingModules > 0) {
      throw new BadRequestException(
        'Esta área já possui módulos. Edite a estrutura atual em vez de gerar outra do zero.',
      );
    }

    const modulesData = templateForAreaType(area.type || 'COURSE');

    // Create modules and lessons in a transaction
    let totalModulesCreated = 0;
    let totalLessonsCreated = 0;

    await this.prisma.$transaction(async (tx) => {
      await forEachSequential(modulesData, async (modData) => {
        const createdModule = await tx.memberModule.create({
          data: {
            memberAreaId: id,
            name: modData.name,
            description: modData.description,
            position: modData.position,
          },
        });
        totalModulesCreated++;

        await forEachSequential(modData.lessons, async (lessonData) => {
          await tx.memberLesson.create({
            data: {
              moduleId: createdModule.id,
              name: lessonData.name,
              type: lessonData.type,
              position: lessonData.position,
            },
          });
          totalLessonsCreated++;
        });
      });

      await tx.memberArea.update({
        where: { id },
        data: {
          totalModules: totalModulesCreated,
          totalLessons: totalLessonsCreated,
          aiGenerated: true,
        },
      });
    });

    // Fetch the full area with generated structure
    const updatedArea = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
      include: {
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });

    this.logger.log(
      `Generated structure for area ${id}: ${totalModulesCreated} modules, ${totalLessonsCreated} lessons`,
    );

    return {
      area: serializeArea(req, updatedArea),
      generated: {
        modules: totalModulesCreated,
        lessons: totalLessonsCreated,
      },
      success: true,
    };
  }
}
