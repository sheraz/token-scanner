import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

function App() {
  // Initialize all state variables
  const [tokens, setTokens] = useState([]);  // Initialize as empty array
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [filters, setFilters] = useState({
    minHolders: 50,  // Lower this from 300
    minLiquidity: 50000,  // Lower this from 1000000
    sortOptions: {
      trending: true,
      holders: false,
      liquidity: false,
      newest: false
    }
  });

  useEffect(() => {
    const fetchTokens = async () => {
      setLoading(true);
      setError(null);  // Reset error state before new fetch
      try {
        const activeSort = Object.entries(filters.sortOptions)
          .filter(([_, isActive]) => isActive)
          .map(([option]) => option)
          .join(',');

        const response = await fetch(
          `http://localhost:3001/api/tokens?` +
          `minHolders=${filters.minHolders}&` +
          `minLiquidity=${filters.minLiquidity}&` +
          `sort=${activeSort}`
        );

        if (!response.ok) {
          throw new Error('Network response was not ok');
        }

        const data = await response.json();
        setTokens(Array.isArray(data) ? data : []); // Ensure tokens is always an array
      } catch (error) {
        console.error('Error fetching tokens:', error);
        setError(error.message);
        setTokens([]); // Reset to empty array on error
      } finally {
        setLoading(false);
      }
    };

    fetchTokens();
  }, [filters]);

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  const handleSortOptionChange = (option) => {
    setFilters(prev => ({
      ...prev,
      sortOptions: {
        ...prev.sortOptions,
        [option]: !prev.sortOptions[option]
      }
    }));
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Meme Token Analyzer</h1>
      
      {/* Filter Section */}
      <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
        <h2 className="text-xl font-bold mb-4">Find Promising Tokens</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Minimum Holders Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Holders
            </label>
            <input
              type="range"
              min="0"
              max="1000"  // Lower this from 10000
              step="10"   // Smaller step
              value={filters.minHolders}
              onChange={(e) => handleFilterChange('minHolders', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-sm text-gray-500 mt-1">
              {filters.minHolders.toLocaleString()}+ holders
            </div>
          </div>

          {/* Minimum Liquidity Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Liquidity
            </label>
            <input
              type="range"
              min="0"
              max="1000000"  // Lower this from higher value
              step="1000"    // Smaller step
              value={filters.minLiquidity}
              onChange={(e) => handleFilterChange('minLiquidity', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-sm text-gray-500 mt-1">
              ${filters.minLiquidity.toLocaleString()}+ liquidity
            </div>
          </div>

          {/* Sort Options Checkboxes */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sort Options (select multiple)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(filters.sortOptions).map(([option, isChecked]) => (
                <label key={option} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleSortOptionChange(option)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm capitalize">{option}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-4">
          Loading tokens...
        </div>
      )}

      {/* Token Display Grid */}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tokens.length === 0 ? (
            <div className="col-span-full text-center py-4">
              No tokens found matching your criteria
            </div>
          ) : (
            tokens.map((token, index) => (
              <div key={index} className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-bold mb-2">{token.name}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Market Cap:</span>
                    <span>${token.marketCap?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Holders:</span>
                    <span>{token.holders?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Liquidity:</span>
                    <span>${token.liquidity?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Debug section */}
      <div className="mt-4 p-4 bg-gray-100 rounded">
        <p className="text-sm text-gray-600">Current Filters:</p>
        <pre className="text-xs">
          {JSON.stringify(filters, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export default App;