class NavStore {
	/** Whether the document browser drawer is open on narrow screens. */
	open = $state(false);

	toggle() {
		this.open = !this.open;
	}
}

export const navStore = new NavStore();
