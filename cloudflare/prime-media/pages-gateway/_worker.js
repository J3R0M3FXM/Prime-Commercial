export default {
  fetch(request, env) {
    return env.MEDIA_WORKER.fetch(request);
  },
};
