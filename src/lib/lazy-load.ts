// See how the options work here: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
let options = {
  root: null,
  rootMargin: "0px",
  threshold: 0
}

export const lazyLoad = (image: HTMLImageElement, src?: string) => {
  let current = src;
  const loaded = () => {
    image.classList.remove("loading");
    image.style.opacity = "1";
  };
  const show = () => {
    if (!current) return;
    image.src = current;
    if (image.complete) {
      loaded();
    } else {
      image.addEventListener("load", loaded, { once: true });
    }
  };
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) show();
  }, options);
  observer.observe(image);

  return {
    // src can change while the element is reused (e.g. navigating between apps),
    // so reload it. Re-observing re-fires the callback for the current visibility.
    update(next?: string) {
      if (next === current) return;
      current = next;
      image.classList.add("loading");
      observer.unobserve(image);
      observer.observe(image);
    },
    destroy() {
      observer.disconnect();
    },
  };
};
