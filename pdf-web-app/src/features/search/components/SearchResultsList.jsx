const SearchResultsList = ({ result, activeMatchIndex, onSelectMatch }) => {
  if (!result) return null;

  if (result.totalMatches === 0) {
    return <p className="empty-state">Sonuç bulunamadı.</p>;
  }

  return (
    <div className="search-results">
      <p className="search-results__summary">Toplam {result.totalMatches} eşleşme bulundu.</p>
      <ul className="search-results__list">
        {result.matches.map((match, index) => (
          <li key={`${match.pageNo}-${match.x}-${match.y}-${index}`}>
            <button
              type="button"
              className={index === activeMatchIndex ? 'search-results__match--active' : ''}
              onClick={() => onSelectMatch(index)}
            >
              <span className="search-results__page">Sayfa {match.pageNo}</span>
              <span className="search-results__text">{match.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SearchResultsList;
