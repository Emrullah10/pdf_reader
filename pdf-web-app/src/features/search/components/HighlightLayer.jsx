import { useEffect, useRef } from 'react';

// bbox koordinatları PDF user-space'inde (pdf.js viewport width/height ile aynı ölçekte) saklanır.
// Bu katman render edilen <canvas>'ın üstüne mutlak konumlanır ve her kutuyu yüzdeye çevirir,
// böylece zoom (canvas ölçeği) değişse bile highlight'lar doğru yerde kalır.
const HighlightLayer = ({ matches, pageWidth, pageHeight, activeMatchIndex }) => {
  const activeBoxRef = useRef(null);

  // Sonuç listesinden bir eşleşme seçmek yalnızca hangi kutunun vurgulanacağını değiştiriyordu;
  // eşleşme görünür alanın dışındaysa (ya da hepsi aynı sayfadaysa) hiçbir şey olmuyormuş gibi
  // görünüyordu. Aktif kutuyu görünüme kaydırarak seçimi takip edilebilir yapıyoruz.
  useEffect(() => {
    activeBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // pageHeight bağımlılığı: canvas asenkron render edildiği için ilk aramada efekt, kutular henüz
    // ölçülmemişken (pageHeight=0, katman null) çalışabiliyor. Sayfa boyutu gelince tekrar denenir.
  }, [activeMatchIndex, pageHeight]);

  if (!pageWidth || !pageHeight) return null;

  return (
    <div className="highlight-layer">
      {matches.map((match, index) => {
        const leftPct = (match.x / pageWidth) * 100;
        const topPct = (match.y / pageHeight) * 100;
        const widthPct = (match.w / pageWidth) * 100;
        const heightPct = (match.h / pageHeight) * 100;
        const isActive = index === activeMatchIndex;

        return (
          <div
            key={`${match.x}-${match.y}-${index}`}
            ref={isActive ? activeBoxRef : null}
            className={`highlight-box${isActive ? ' highlight-box--active' : ''}`}
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
            }}
          />
        );
      })}
    </div>
  );
};

export default HighlightLayer;
