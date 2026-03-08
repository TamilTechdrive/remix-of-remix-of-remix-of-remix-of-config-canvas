import { useState, useCallback } from 'react';
import type { Project, Build, BuildModule, ModuleType } from '@/types/projectTypes';
import { toast } from 'sonner';

const STORAGE_KEY = 'configflow_projects';

const generateId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const loadProjects = (): Project[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveProjects = (projects: Project[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
};

export const useProjectStore = () => {
  const [projects, setProjects] = useState<Project[]>(loadProjects);

  const persist = useCallback((updated: Project[]) => {
    setProjects(updated);
    saveProjects(updated);
  }, []);

  // ── Project CRUD ──────────────────────────────

  const createProject = useCallback((data: { name: string; description: string; tags?: string[] }): Project => {
    const project: Project = {
      id: generateId(),
      name: data.name,
      description: data.description,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      builds: [],
      tags: data.tags || [],
    };
    const updated = [...projects, project];
    persist(updated);
    toast.success('Project Created', { description: project.name });
    return project;
  }, [projects, persist]);

  const updateProject = useCallback((id: string, data: Partial<Pick<Project, 'name' | 'description' | 'status' | 'tags'>>) => {
    const updated = projects.map(p =>
      p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
    );
    persist(updated);
    toast.success('Project Updated');
  }, [projects, persist]);

  const deleteProject = useCallback((id: string) => {
    persist(projects.filter(p => p.id !== id));
    toast.success('Project Deleted');
  }, [projects, persist]);

  const cloneProject = useCallback((id: string): Project | undefined => {
    const source = projects.find(p => p.id === id);
    if (!source) return;
    const clone: Project = {
      ...JSON.parse(JSON.stringify(source)),
      id: generateId(),
      name: `${source.name} (Copy)`,
      status: 'draft' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Regenerate build IDs
    clone.builds = clone.builds.map((b: Build) => ({
      ...b,
      id: generateId(),
      projectId: clone.id,
      modules: b.modules.map((m: BuildModule) => ({ ...m, id: generateId(), buildId: b.id })),
    }));
    const updated = [...projects, clone];
    persist(updated);
    toast.success('Project Cloned', { description: clone.name });
    return clone;
  }, [projects, persist]);

  // ── Build CRUD ──────────────────────────────

  const createBuild = useCallback((projectId: string, data: { name: string; version: string; description: string }): Build | undefined => {
    const build: Build = {
      id: generateId(),
      projectId,
      name: data.name,
      version: data.version,
      description: data.description,
      status: 'draft',
      modules: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = projects.map(p =>
      p.id === projectId
        ? { ...p, builds: [...p.builds, build], updatedAt: new Date().toISOString() }
        : p
    );
    persist(updated);
    toast.success('Build Created', { description: `${data.name} v${data.version}` });
    return build;
  }, [projects, persist]);

  const updateBuild = useCallback((projectId: string, buildId: string, data: Partial<Pick<Build, 'name' | 'version' | 'description' | 'status'>>) => {
    const updated = projects.map(p =>
      p.id === projectId
        ? {
            ...p,
            updatedAt: new Date().toISOString(),
            builds: p.builds.map(b =>
              b.id === buildId ? { ...b, ...data, updatedAt: new Date().toISOString() } : b
            ),
          }
        : p
    );
    persist(updated);
    toast.success('Build Updated');
  }, [projects, persist]);

  const deleteBuild = useCallback((projectId: string, buildId: string) => {
    const updated = projects.map(p =>
      p.id === projectId
        ? { ...p, builds: p.builds.filter(b => b.id !== buildId), updatedAt: new Date().toISOString() }
        : p
    );
    persist(updated);
    toast.success('Build Deleted');
  }, [projects, persist]);

  const cloneBuild = useCallback((projectId: string, buildId: string): Build | undefined => {
    const project = projects.find(p => p.id === projectId);
    const source = project?.builds.find(b => b.id === buildId);
    if (!project || !source) return;

    const nextVersion = incrementVersion(source.version);
    const clone: Build = {
      ...JSON.parse(JSON.stringify(source)),
      id: generateId(),
      name: `${source.name}`,
      version: nextVersion,
      status: 'draft' as const,
      parentBuildId: source.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    clone.modules = clone.modules.map((m: BuildModule) => ({ ...m, id: generateId(), buildId: clone.id }));

    const updated = projects.map(p =>
      p.id === projectId
        ? { ...p, builds: [...p.builds, clone], updatedAt: new Date().toISOString() }
        : p
    );
    persist(updated);
    toast.success('Build Versioned', { description: `v${nextVersion} from v${source.version}` });
    return clone;
  }, [projects, persist]);

  // ── Module CRUD ──────────────────────────────

  const addModule = useCallback((projectId: string, buildId: string, data: { name: string; type: ModuleType; description: string }): BuildModule | undefined => {
    const mod: BuildModule = {
      id: generateId(),
      buildId,
      name: data.name,
      type: data.type,
      description: data.description,
      nodes: [],
      edges: [],
      enabled: true,
      order: 0,
    };
    const updated = projects.map(p =>
      p.id === projectId
        ? {
            ...p,
            updatedAt: new Date().toISOString(),
            builds: p.builds.map(b =>
              b.id === buildId
                ? { ...b, modules: [...b.modules, mod], updatedAt: new Date().toISOString() }
                : b
            ),
          }
        : p
    );
    persist(updated);
    toast.success('Module Added', { description: data.name });
    return mod;
  }, [projects, persist]);

  const updateModule = useCallback((projectId: string, buildId: string, moduleId: string, data: Partial<BuildModule>) => {
    const updated = projects.map(p =>
      p.id === projectId
        ? {
            ...p,
            updatedAt: new Date().toISOString(),
            builds: p.builds.map(b =>
              b.id === buildId
                ? {
                    ...b,
                    updatedAt: new Date().toISOString(),
                    modules: b.modules.map(m =>
                      m.id === moduleId ? { ...m, ...data } : m
                    ),
                  }
                : b
            ),
          }
        : p
    );
    persist(updated);
  }, [projects, persist]);

  const deleteModule = useCallback((projectId: string, buildId: string, moduleId: string) => {
    const updated = projects.map(p =>
      p.id === projectId
        ? {
            ...p,
            updatedAt: new Date().toISOString(),
            builds: p.builds.map(b =>
              b.id === buildId
                ? { ...b, modules: b.modules.filter(m => m.id !== moduleId), updatedAt: new Date().toISOString() }
                : b
            ),
          }
        : p
    );
    persist(updated);
    toast.success('Module Deleted');
  }, [projects, persist]);

  const saveModuleConfig = useCallback((projectId: string, buildId: string, moduleId: string, nodes: any[], edges: any[]) => {
    updateModule(projectId, buildId, moduleId, { nodes, edges });
  }, [updateModule]);

  // ── Helpers ──────────────────────────────

  const getProject = useCallback((id: string) => projects.find(p => p.id === id), [projects]);
  const getBuild = useCallback((projectId: string, buildId: string) => {
    const p = projects.find(pr => pr.id === projectId);
    return p?.builds.find(b => b.id === buildId);
  }, [projects]);
  const getModule = useCallback((projectId: string, buildId: string, moduleId: string) => {
    const b = getBuild(projectId, buildId);
    return b?.modules.find(m => m.id === moduleId);
  }, [getBuild]);

  return {
    projects,
    createProject,
    updateProject,
    deleteProject,
    cloneProject,
    createBuild,
    updateBuild,
    deleteBuild,
    cloneBuild,
    addModule,
    updateModule,
    deleteModule,
    saveModuleConfig,
    getProject,
    getBuild,
    getModule,
  };
};

function incrementVersion(v: string): string {
  const parts = v.split('.').map(Number);
  if (parts.length === 3) {
    parts[2]++;
    return parts.join('.');
  }
  return v + '.1';
}
