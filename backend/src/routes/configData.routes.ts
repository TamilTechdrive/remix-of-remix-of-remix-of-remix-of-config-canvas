import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ── Save full config with nodes and edges ──
router.post('/:id/save-full', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { nodes, edges } = req.body;
  const userId = req.user!.userId;

  try {
    await db.transaction(async (trx) => {
      // Verify config ownership / access
      const config = await trx('configurations').where({ id }).first();
      if (!config) return res.status(404).json({ error: 'Configuration not found' });

      // Clear existing nodes and edges
      await trx('config_nodes').where({ configuration_id: id }).del();
      await trx('config_edges').where({ configuration_id: id }).del();

      // Insert nodes
      if (nodes && nodes.length > 0) {
        const nodeRows = nodes.map((n: any) => ({
          configuration_id: id,
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

      // Insert edges
      if (edges && edges.length > 0) {
        const edgeRows = edges.map((e: any) => ({
          configuration_id: id,
          edge_id: e.id,
          source_node_id: e.source,
          target_node_id: e.target,
          edge_type: e.type || 'smoothstep',
          animated: e.animated !== false,
          style: JSON.stringify(e.style || {}),
        }));
        await trx('config_edges').insert(edgeRows);
      }

      // Update config metadata
      await trx('configurations').where({ id }).update({
        updated_at: trx.fn.now(),
      });

      // Audit log
      await trx('audit_logs').insert({
        user_id: userId,
        event: 'CONFIG_FULL_SAVE',
        resource: 'configuration',
        resource_id: id,
        details: JSON.stringify({ nodeCount: nodes?.length || 0, edgeCount: edges?.length || 0 }),
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      });
    });

    res.json({ success: true, message: 'Configuration saved with all nodes and edges' });
  } catch (error) {
    logger.error('Full config save failed', { error, configId: id });
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// ── Load full config with nodes and edges ──
router.get('/:id/load-full', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const config = await db('configurations').where({ id }).first();
    if (!config) return res.status(404).json({ error: 'Configuration not found' });

    const nodes = await db('config_nodes').where({ configuration_id: id }).orderBy('created_at');
    const edges = await db('config_edges').where({ configuration_id: id }).orderBy('created_at');

    // Transform back to React Flow format
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

    res.json({
      config,
      nodes: flowNodes,
      edges: flowEdges,
    });
  } catch (error) {
    logger.error('Full config load failed', { error, configId: id });
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

// ── Create snapshot ──
router.post('/:id/snapshots', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const userId = req.user!.userId;

  try {
    const nodes = await db('config_nodes').where({ configuration_id: id });
    const edges = await db('config_edges').where({ configuration_id: id });

    const snapshot = await db('config_snapshots').insert({
      configuration_id: id,
      created_by: userId,
      snapshot_name: name || `Snapshot ${new Date().toISOString()}`,
      description: description || null,
      nodes_data: JSON.stringify(nodes),
      edges_data: JSON.stringify(edges),
      node_count: nodes.length,
      edge_count: edges.length,
    }).returning('*');

    res.status(201).json(snapshot[0]);
  } catch (error) {
    logger.error('Snapshot creation failed', { error, configId: id });
    res.status(500).json({ error: 'Failed to create snapshot' });
  }
});

// ── List snapshots ──
router.get('/:id/snapshots', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const snapshots = await db('config_snapshots')
      .where({ configuration_id: id })
      .orderBy('created_at', 'desc')
      .select('id', 'snapshot_name', 'description', 'node_count', 'edge_count', 'created_at');
    res.json(snapshots);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list snapshots' });
  }
});

// ── Restore snapshot ──
router.post('/:id/snapshots/:snapshotId/restore', authenticate, async (req: Request, res: Response) => {
  const { id, snapshotId } = req.params;

  try {
    const snapshot = await db('config_snapshots').where({ id: snapshotId, configuration_id: id }).first();
    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });

    const nodesData = typeof snapshot.nodes_data === 'string' ? JSON.parse(snapshot.nodes_data) : snapshot.nodes_data;
    const edgesData = typeof snapshot.edges_data === 'string' ? JSON.parse(snapshot.edges_data) : snapshot.edges_data;

    await db.transaction(async (trx) => {
      await trx('config_nodes').where({ configuration_id: id }).del();
      await trx('config_edges').where({ configuration_id: id }).del();
      if (nodesData.length > 0) await trx('config_nodes').insert(nodesData.map((n: any) => ({ ...n, configuration_id: id })));
      if (edgesData.length > 0) await trx('config_edges').insert(edgesData.map((e: any) => ({ ...e, configuration_id: id })));
    });

    res.json({ success: true, message: 'Snapshot restored' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore snapshot' });
  }
});

export default router;