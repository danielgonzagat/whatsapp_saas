(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, options) {
    if (type === '2d' && this?.style?.mixBlendMode === 'screen') {
      return null;
    }
    return original.call(this, type, options);
  };
})();
