import { AlertTriangle, Plus, Sparkles, ChevronRight, Check, Zap, Info, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ConfigNodeData, ConfigNodeType } from '@/types/configTypes';
import { NODE_LABELS } from '@/types/configTypes';
import { DEPENDENCY_RULES, type DependencySuggestion } from '@/types/connectionRules';
import type { Edge } from '@xyflow/react';

interface DependencySuggestionsProps {
  nodeId: string;
  nodeData: ConfigNodeData;
  edges: Edge[];
  allNodes: { id: string; data: unknown }[];
  onAutoAdd: (parentId: string, type: ConfigNodeType) => void;
}

const TYPE_ICONS: Record<string, string> = {
  container: '📦',
  module: '🧩',
  group: '📁',
  option: '⚡',
};

const DependencySuggestions = ({
  nodeId,
  nodeData,
  edges,
  allNodes,
  onAutoAdd,
}: DependencySuggestionsProps) => {
  const suggestions = DEPENDENCY_RULES[nodeData.type];
  if (!suggestions || suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <div className="w-10 h-10 rounded-full bg-node-module/10 flex items-center justify-center mb-2">
          <Check className="w-5 h-5 text-node-module" />
        </div>
        <p className="text-xs font-medium text-foreground">All set!</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">No dependency suggestions for this node type.</p>
      </div>
    );
  }

  const childEdges = edges.filter((e) => e.source === nodeId);
  const childIds = childEdges.map((e) => e.target);
  const childNodes = allNodes.filter((n) => childIds.includes(n.id));
  const childTypes = childNodes.map((n) => (n.data as unknown as ConfigNodeData).type);

  const missingSuggestions = suggestions.filter((s) => {
    if (s.required) return !childTypes.includes(s.type);
    return childTypes.filter((t) => t === s.type).length < 2;
  });

  const satisfiedSuggestions = suggestions.filter((s) => !missingSuggestions.includes(s));
  const requiredMissing = missingSuggestions.filter((s) => s.required);
  const optionalSuggestions = missingSuggestions.filter((s) => !s.required);

  return (
    <div className="space-y-3">
      {/* Status summary bar */}
      <div className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${
        requiredMissing.length > 0 
          ? 'bg-destructive/5 border-destructive/20' 
          : 'bg-node-module/5 border-node-module/20'
      }`}>
        {requiredMissing.length > 0 ? (
          <>
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-destructive">{requiredMissing.length} required {requiredMissing.length === 1 ? 'dependency' : 'dependencies'} missing</p>
              <p className="text-muted-foreground text-[10px] mt-0.5">Add these to ensure proper configuration</p>
            </div>
          </>
        ) : (
          <>
            <Check className="w-4 h-4 text-node-module shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-node-module">All required dependencies met</p>
              <p className="text-muted-foreground text-[10px] mt-0.5">
                {optionalSuggestions.length > 0 
                  ? `${optionalSuggestions.length} optional ${optionalSuggestions.length === 1 ? 'suggestion' : 'suggestions'} available` 
                  : 'Configuration is complete'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Required missing */}
      {requiredMissing.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <Zap className="w-3 h-3 text-destructive" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Required</span>
          </div>
          {requiredMissing.map((s, i) => (
            <SuggestionCard key={`req-${i}`} suggestion={s} onAdd={() => onAutoAdd(nodeId, s.type)} variant="required" />
          ))}
        </div>
      )}

      {/* Optional suggestions */}
      {optionalSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <Sparkles className="w-3 h-3 text-accent" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Suggested</span>
          </div>
          {optionalSuggestions.map((s, i) => (
            <SuggestionCard key={`opt-${i}`} suggestion={s} onAdd={() => onAutoAdd(nodeId, s.type)} variant="optional" />
          ))}
        </div>
      )}

      {/* Already satisfied */}
      {satisfiedSuggestions.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 px-1">
            <Check className="w-3 h-3 text-node-module" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Satisfied</span>
          </div>
          {satisfiedSuggestions.map((s, i) => (
            <div key={`sat-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 text-[10px] text-muted-foreground">
              <span>{TYPE_ICONS[s.type] || '📄'}</span>
              <span className="line-through">{s.label}</span>
              <Badge variant="outline" className="text-[8px] h-3.5 px-1 ml-auto border-node-module/30 text-node-module">Done</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SuggestionCard = ({
  suggestion,
  onAdd,
  variant,
}: {
  suggestion: DependencySuggestion;
  onAdd: () => void;
  variant: 'required' | 'optional';
}) => (
  <div
    className={`group relative rounded-lg border p-3 transition-all hover:shadow-sm ${
      variant === 'required'
        ? 'border-destructive/30 bg-destructive/5 hover:border-destructive/50'
        : 'border-border bg-card hover:border-accent/30'
    }`}
  >
    <div className="flex items-start gap-2.5">
      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-sm ${
        variant === 'required' ? 'bg-destructive/10' : 'bg-accent/10'
      }`}>
        {TYPE_ICONS[suggestion.type] || '📄'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-foreground">{suggestion.label}</p>
          <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${
            variant === 'required' ? 'border-destructive/40 text-destructive' : 'border-accent/40 text-accent'
          }`}>
            {variant === 'required' ? 'Required' : 'Optional'}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{suggestion.reason}</p>
      </div>
      <Button
        variant={variant === 'required' ? 'default' : 'outline'}
        size="sm"
        className="h-7 px-2.5 gap-1 text-[10px] shrink-0"
        onClick={onAdd}
      >
        <Plus className="w-3 h-3" />
        Add
      </Button>
    </div>
  </div>
);

export default DependencySuggestions;
