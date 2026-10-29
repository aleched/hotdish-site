class NavStore {
	/** Whether the recipe browser drawer is open on narrow screens. */
	open = $state(false);

	toggle() {
		this.open = !this.open;
	}
}

export const navStore = new NavStore();
