/**
 * Favorites & Trip Bucket List Component
 * Saves and manages bookmarked countries and geocoded places in localStorage.
 */

class FavoritesManager {
  constructor() {
    this.STORAGE_KEY = 'globalpulse_saved_places';
    this.favorites = this.loadFavorites();
  }

  loadFavorites() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.favorites));
  }

  isFavorite(id) {
    return this.favorites.some(f => f.id === id);
  }

  toggleFavorite(item) {
    // item: { id: 'PHL' | 'custom_lat_lon', name: string, type: 'country' | 'location', flag?: string, details?: string }
    const index = this.favorites.findIndex(f => f.id === item.id);
    if (index >= 0) {
      this.favorites.splice(index, 1);
      this.save();
      return false; // Removed
    } else {
      this.favorites.push({
        ...item,
        savedAt: new Date().toISOString()
      });
      this.save();
      return true; // Added
    }
  }

  getFavorites() {
    return [...this.favorites];
  }

  removeFavorite(id) {
    this.favorites = this.favorites.filter(f => f.id !== id);
    this.save();
  }

  exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.favorites, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `GlobalPulse_Saved_Places_${new Date().toISOString().slice(0,10)}.json`);
    dlAnchorElem.click();
  }
}

export const favoritesManager = new FavoritesManager();
