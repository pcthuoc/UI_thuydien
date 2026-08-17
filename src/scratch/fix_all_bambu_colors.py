import re
import os

target_files = [
    'src/components/StationWorkbenchDrawer.tsx',
    'src/pages/StationsPage.tsx',
    'src/pages/StationsMapPage.tsx',
    'src/pages/HydroOverviewPage.tsx',
    'src/pages/InterpolationTablesPage.tsx',
    'src/pages/CalculatedValuesPage.tsx',
    'src/pages/ProjectSettingsPage.tsx',
]

base_dir = '/mnt/d/job/thuydien/docker/frontend'

replacements = [
    # Dark variants first
    ('dark:bg-bambu-dark-secondary/50', 'dark:bg-zinc-900/50'),
    ('dark:bg-bambu-dark-secondary', 'dark:bg-zinc-900'),
    ('dark:bg-bambu-dark', 'dark:bg-zinc-950'),
    ('dark:border-bambu-dark-tertiary/60', 'dark:border-zinc-800/60'),
    ('dark:border-bambu-dark-tertiary', 'dark:border-zinc-800'),
    ('dark:hover:bg-bambu-dark-tertiary/40', 'dark:hover:bg-zinc-800/40'),
    ('dark:hover:bg-bambu-dark-tertiary', 'dark:hover:bg-zinc-800'),
    ('dark:divide-bambu-dark-tertiary', 'dark:divide-zinc-800'),
    ('dark:text-bambu-gray-light', 'dark:text-zinc-400'),
    ('dark:text-bambu-gray', 'dark:text-zinc-400'),
    ('dark:text-bambu-green', 'dark:text-emerald-400'),
    
    # Standalone bambu replacements
    ('bg-bambu-dark-secondary/50', 'bg-slate-50/80 dark:bg-zinc-900/50'),
    ('bg-bambu-dark-secondary', 'bg-white dark:bg-zinc-900'),
    ('bg-bambu-dark-tertiary/40', 'bg-slate-100/60 dark:bg-zinc-800/40'),
    ('bg-bambu-dark-tertiary', 'bg-slate-100 dark:bg-zinc-800'),
    ('bg-bambu-dark/40', 'bg-slate-50/70 dark:bg-zinc-950/40'),
    ('bg-bambu-dark', 'bg-white dark:bg-zinc-950'),
    
    ('border-bambu-dark-tertiary/60', 'border-slate-200/80 dark:border-zinc-800/80'),
    ('border-bambu-dark-tertiary', 'border-slate-200 dark:border-zinc-800'),
    ('border-bambu-gray-dark', 'border-slate-300 dark:border-zinc-700'),
    ('border-bambu-green', 'border-emerald-500'),
    ('divide-bambu-dark-tertiary', 'divide-slate-200 dark:divide-zinc-800'),
    
    ('hover:bg-bambu-dark-tertiary/40', 'hover:bg-slate-100 dark:hover:bg-zinc-800/40'),
    ('hover:bg-bambu-dark-tertiary', 'hover:bg-slate-100 dark:hover:bg-zinc-800'),
    ('hover:bg-bambu-green-dark', 'hover:bg-emerald-700'),
    ('hover:bg-bambu-green/10', 'hover:bg-emerald-500/10'),
    ('hover:bg-bambu-green', 'hover:bg-emerald-600'),
    ('hover:border-bambu-green', 'hover:border-emerald-500'),
    
    ('focus:ring-bambu-green', 'focus:ring-emerald-500 focus:border-emerald-500'),
    ('placeholder-bambu-gray', 'placeholder-slate-400 dark:placeholder-zinc-500'),
    ('placeholder:text-slate-400 dark:placeholder-bambu-gray', 'placeholder-slate-400 dark:placeholder-zinc-500'),
    
    ('text-bambu-gray-light', 'text-slate-500 dark:text-zinc-400'),
    ('text-bambu-gray', 'text-slate-500 dark:text-zinc-400'),
    ('text-bambu-green', 'text-emerald-600 dark:text-emerald-400'),
    ('bg-bambu-green', 'bg-emerald-600'),
]

for rel_path in target_files:
    full_path = os.path.join(base_dir, rel_path)
    if not os.path.exists(full_path):
        continue
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old, new in replacements:
        content = content.replace(old, new)
    
    # Fix dark:dark:
    content = content.replace('dark:dark:', 'dark:')
    
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Cleaned {rel_path}")

print("All target pages cleaned successfully!")
