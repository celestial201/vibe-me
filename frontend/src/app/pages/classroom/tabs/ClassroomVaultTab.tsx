import React, { useState } from 'react';
import { useGetVaultItems, useCreateVaultItem, useDeleteVaultItem } from '@/hooks/classroom-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Link as LinkIcon, FileText, FileSpreadsheet, File, ExternalLink, Plus } from 'lucide-react';
import { format } from 'date-fns';

interface ClassroomVaultTabProps {
  classroomId: string;
  isInstructor: boolean;
}

export function ClassroomVaultTab({ classroomId, isInstructor }: ClassroomVaultTabProps) {
  const { data: vaultItems, isLoading } = useGetVaultItems(classroomId);
  const createMutation = useCreateVaultItem(classroomId);
  const deleteMutation = useDeleteVaultItem(classroomId);

  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    type: 'link' as 'link' | 'pdf' | 'csv' | 'other',
    url: '',
    description: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.url) return;
    createMutation.mutate(formData, {
      onSuccess: () => {
        setIsAdding(false);
        setFormData({ title: '', type: 'link', url: '', description: '' });
      }
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText className="w-5 h-5 text-red-500" />;
      case 'csv': return <FileSpreadsheet className="w-5 h-5 text-green-500" />;
      case 'link': return <LinkIcon className="w-5 h-5 text-blue-500" />;
      default: return <File className="w-5 h-5 text-gray-500" />;
    }
  };

  if (isLoading) {
    return <div className="text-center p-8 text-muted-foreground animate-pulse">Loading vault items...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Classroom Vault</h2>
          <p className="text-sm text-muted-foreground">Important resources and materials for this classroom.</p>
        </div>
        {isInstructor && !isAdding && (
          <Button onClick={() => setIsAdding(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" /> Add Resource
          </Button>
        )}
      </div>

      {isAdding && isInstructor && (
        <Card className="border border-border/50 bg-muted/20">
          <CardHeader>
            <CardTitle className="text-lg">Add New Resource</CardTitle>
            <CardDescription>Upload a link or file reference to the vault.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input 
                    required 
                    placeholder="e.g. Course Syllabus" 
                    value={formData.title} 
                    onChange={e => setFormData({ ...formData, title: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Resource Type</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(val: any) => setFormData({ ...formData, type: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="link">Web Link</SelectItem>
                      <SelectItem value="pdf">PDF Document</SelectItem>
                      <SelectItem value="csv">CSV Spreadsheet</SelectItem>
                      <SelectItem value="other">Other File</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>URL / Link *</Label>
                <Input 
                  required 
                  type="url" 
                  placeholder="https://..." 
                  value={formData.url} 
                  onChange={e => setFormData({ ...formData, url: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <Label>Description (Optional)</Label>
                <Input 
                  placeholder="Brief context about this resource..." 
                  value={formData.description} 
                  onChange={e => setFormData({ ...formData, description: e.target.value })} 
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Adding...' : 'Save Resource'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {!vaultItems?.length && !isAdding ? (
        <div className="text-center py-12 border-2 border-dashed border-border/60 rounded-xl bg-muted/10">
          <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-foreground">Vault is empty</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {isInstructor ? "Add resources here so your students can easily access them anytime." : "Your instructor hasn't added any resources yet."}
          </p>
          {isInstructor && (
            <Button onClick={() => setIsAdding(true)} variant="secondary" className="mt-4">
              Add First Resource
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vaultItems?.map(item => (
            <Card key={item._id} className="group overflow-hidden flex flex-col hover:border-primary/50 transition-colors">
              <CardContent className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="p-2 bg-muted rounded-lg shrink-0">
                    {getIcon(item.type)}
                  </div>
                  {isInstructor && (
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => {
                        if (confirm('Delete this resource?')) {
                          deleteMutation.mutate(item._id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                
                <h3 className="font-semibold text-base line-clamp-2 mb-1 group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
                
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-3 mb-4 flex-1">
                    {item.description}
                  </p>
                )}

                <div className="mt-auto pt-4 flex items-center justify-between border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {format(new Date(item.createdAt), 'MMM d, yyyy')}
                  </span>
                  <a 
                    href={item.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
