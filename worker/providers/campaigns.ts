export const Campaigns = {
  async trigger(id: string, users: string[]) {
    console.log("Campaign trigger", id, users);
  },

  async run(payload: { id: string; user: string; action: string }) {
    console.log("Campaign run", payload);
  },
};
