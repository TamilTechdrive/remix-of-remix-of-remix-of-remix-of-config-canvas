import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { v4 as uuid } from 'uuid';

const router = Router();
router.use(requireAuth);

// ── LIST PROJECTS ──
router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  try {
    const projects = await db('projects').where({ owner_id: userId }).orderBy('updated_at', 'desc');
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// ── CREATE PROJECT ──
router.post('/', async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { name, description, tags } = req.body;
  try {
    const [project] = await db('projects').insert({
      id: uuid(),
      name,
      description: description || null,
      owner_id: userId,
      tags: JSON.stringify(tags || []),
    }).returning('*');
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// ── GET PROJECT with STB Models, Builds ──
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await db('projects').where({ id: req.params.id }).first();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const stbModels = await db('stb_models').where({ project_id: project.id });
    const enriched = await Promise.all(stbModels.map(async (model: any) => {
      const builds = await db('builds').where({ stb_model_id: model.id }).orderBy('created_at', 'desc');
      const enrichedBuilds = await Promise.all(builds.map(async (build: any) => {
        const configs = await db('configurations')
          .where({ build_id: build.id })
          .select('id', 'name', 'status', 'version', 'created_at', 'updated_at');
        return { ...build, configurations: configs };
      }));
      return { ...model, builds: enrichedBuilds };
    }));

    res.json({ ...project, stbModels: enriched });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load project' });
  }
});

// ── CREATE STB MODEL ──
router.post('/:projectId/stb-models', async (req: Request, res: Response) => {
  const { name, description, chipset } = req.body;
  try {
    const [model] = await db('stb_models').insert({
      id: uuid(),
      project_id: req.params.projectId,
      name,
      description: description || null,
      chipset: chipset || null,
    }).returning('*');
    res.status(201).json(model);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create STB model' });
  }
});

// ── CREATE BUILD ──
router.post('/stb-models/:modelId/builds', async (req: Request, res: Response) => {
  const { name, description, version } = req.body;
  try {
    const [build] = await db('builds').insert({
      id: uuid(),
      stb_model_id: req.params.modelId,
      name,
      description: description || null,
      version: version || 'v1.0.0',
    }).returning('*');
    res.status(201).json(build);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create build' });
  }
});

// ── SAVE PARSER SESSION AS CONFIG TO BUILD ──
// Converts parser session → RawConfig → normalized nodes/edges → DB
router.post('/builds/:buildId/save-parser-config', async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { buildId } = req.params;
  const { parserSessionId, configName, nodes, edges } = req.body;

  if (!nodes || !edges) {
    return res.status(400).json({ error: 'nodes and edges are required' });
  }

  try {
    const result = await db.transaction(async (trx) => {
      // Verify build exists
      const build = await trx('builds').where({ id: buildId }).first();
      if (!build) throw new Error('Build not found');

      // Create configuration record
      const configId = uuid();
      await trx('configurations').insert({
        id: configId,
        owner_id: userId,
        name: configName || `Parser Config ${new Date().toISOString()}`,
        config_data: JSON.stringify({ source: 'parser', parserSessionId }),
        build_id: buildId,
        parser_session_id: parserSessionId || null,
        status: 'draft',
      });

      // Insert normalized nodes
      if (nodes.length > 0) {
        const nodeRows = nodes.map((n: any) => ({
          id: uuid(),
          configuration_id: configId,
          node_id: n.id,
          node_type: n.data?.type || 'option',
          label: n.data?.label || 'Untitled',
          description: n.data?.description || null,
          visible: n.data?.visible !== false,
          included: n.data?.properties?.included ?? null,
          properties: JSON.stringify(n.data?.properties || {}),
          position: JSON.stringify(n.position || { x: 0, y: 0 }),
          visibility_rule: n.data?.visibilityRule || null,
          validation_rules: JSON.stringify(n.data?.validationRules || []),
          user_rules: JSON.stringify(n.data?.properties?.userRules || []),
          impact_level: n.data?.properties?.impact_level || 'low',
          priority: n.data?.properties?.priority || 0,
          tags: JSON.stringify(n.data?.properties?.tags || []),
          must_enable: n.data?.properties?.must_enable === true,
          must_disable: n.data?.properties?.must_disable === true,
          color_tag: n.data?.properties?.colorTag || null,
          notes: n.data?.properties?.notes || null,
        }));
        await trx('config_nodes').insert(nodeRows);
      }

      // Insert normalized edges
      if (edges.length > 0) {
        const edgeRows = edges.map((e: any) => ({
          id: uuid(),
          configuration_id: configId,
          edge_id: e.id,
          source_node_id: e.source,
          target_node_id: e.target,
          edge_type: e.type || 'smoothstep',
          animated: e.animated !== false,
          style: JSON.stringify(e.style || {}),
        }));
        await trx('config_edges').insert(edgeRows);
      }

      // Audit
      await trx('audit_logs').insert({
        user_id: userId,
        event: 'PARSER_CONFIG_SAVED',
        resource: 'configurations',
        resource_id: configId,
        details: JSON.stringify({ buildId, parserSessionId, nodeCount: nodes.length, edgeCount: edges.length }),
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      });

      return { configId, nodeCount: nodes.length, edgeCount: edges.length };
    });

    res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Save parser config failed', { error });
    res.status(error.message === 'Build not found' ? 404 : 500).json({ error: error.message || 'Failed to save config' });
  }
});

// ── LOAD CONFIG (nodes/edges) BY CONFIG ID ──
router.get('/configurations/:configId/full', async (req: Request, res: Response) => {
  const { configId } = req.params;
  try {
    const config = await db('configurations').where({ id: configId }).first();
    if (!config) return res.status(404).json({ error: 'Configuration not found' });

    const nodes = await db('config_nodes').where({ configuration_id: configId }).orderBy('created_at');
    const edges = await db('config_edges').where({ configuration_id: configId }).orderBy('created_at');

    const flowNodes = nodes.map((n: any) => ({
      id: n.node_id,
      type: 'configNode',
      position: typeof n.position === 'string' ? JSON.parse(n.position) : n.position,
      data: {
        label: n.label,
        type: n.node_type,
        description: n.description,
        visible: n.visible,
        visibilityRule: n.visibility_rule,
        validationRules: typeof n.validation_rules === 'string' ? JSON.parse(n.validation_rules) : n.validation_rules,
        properties: {
          ...(typeof n.properties === 'string' ? JSON.parse(n.properties) : n.properties),
          included: n.included,
          userRules: typeof n.user_rules === 'string' ? JSON.parse(n.user_rules) : n.user_rules,
          impact_level: n.impact_level,
          priority: n.priority,
          tags: typeof n.tags === 'string' ? JSON.parse(n.tags) : n.tags,
          must_enable: n.must_enable,
          must_disable: n.must_disable,
          colorTag: n.color_tag,
          notes: n.notes,
        },
      },
    }));

    const flowEdges = edges.map((e: any) => ({
      id: e.edge_id,
      source: e.source_node_id,
      target: e.target_node_id,
      type: e.edge_type,
      animated: e.animated,
      style: typeof e.style === 'string' ? JSON.parse(e.style) : e.style,
    }));

    res.json({ config, nodes: flowNodes, edges: flowEdges });
  } catch (error) {
    logger.error('Load config failed', { error });
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

// ── LIST CONFIGS FOR A BUILD ──
router.get('/builds/:buildId/configurations', async (req: Request, res: Response) => {
  try {
    const configs = await db('configurations')
      .where({ build_id: req.params.buildId })
      .select('id', 'name', 'status', 'version', 'parser_session_id', 'created_at', 'updated_at')
      .orderBy('updated_at', 'desc');
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list configurations' });
  }
});

export default router;
