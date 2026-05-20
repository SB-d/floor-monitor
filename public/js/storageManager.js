class StorageManager {
    constructor() {
        this.storageKey = 'contacta_floor_layout';
        this.zonesKey = 'contacta_floor_zones';
    }
    
    saveLayout(desks) {
        try {
            const layoutData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                desks: desks.map(desk => ({
                    id: desk.id,
                    x: desk.x,
                    y: desk.y,
                    status: desk.status,
                    agent: desk.agent,
                    extension: desk.extension,
                    campaign: desk.campaign,
                    isLocked: desk.isLocked || false,
                    customColor: desk.customColor || null
                }))
            };
            localStorage.setItem(this.storageKey, JSON.stringify(layoutData));
            return true;
        } catch (error) {
            console.error('Error saving layout:', error);
            return false;
        }
    }
    
    loadLayout() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const layoutData = JSON.parse(saved);
                return layoutData.desks;
            }
        } catch (error) {
            console.error('Error loading layout:', error);
        }
        return null;
    }
    
    saveZones(zones) {
        try {
            localStorage.setItem(this.zonesKey, JSON.stringify(zones));
            return true;
        } catch (error) {
            console.error('Error saving zones:', error);
            return false;
        }
    }
    
    loadZones() {
        try {
            const saved = localStorage.getItem(this.zonesKey);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error('Error loading zones:', error);
        }
        return [];
    }
    
    exportLayout(desks, zones) {
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            desks: desks.map(desk => ({
                id: desk.id,
                x: desk.x,
                y: desk.y,
                status: desk.status,
                agent: desk.agent,
                extension: desk.extension,
                campaign: desk.campaign,
                width: 80,
                height: 60,
                metadata: desk.metadata || {}
            })),
            zones: zones,
            settings: {
                gridEnabled: window.editorManager?.snapEnabled || false,
                gridSize: window.editorManager?.gridSize || 40
            }
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `floor_layout_${new Date().toISOString().slice(0, 19)}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        return true;
    }
    
    importLayout(jsonData, merge = false) {
        try {
            const importData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            
            if (!importData.desks || !Array.isArray(importData.desks)) {
                throw new Error('Invalid layout format');
            }
            
            return {
                desks: importData.desks,
                zones: importData.zones || [],
                settings: importData.settings || {}
            };
        } catch (error) {
            console.error('Error importing layout:', error);
            return null;
        }
    }
    
    clearLayout() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.zonesKey);
    }
    
    hasSavedLayout() {
        return localStorage.getItem(this.storageKey) !== null;
    }
}