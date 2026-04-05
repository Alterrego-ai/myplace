import UIKit
import Capacitor

class MyViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        // Laisser le WebView respecter les safe areas iOS (status bar, notch)
        // Le CSS env(safe-area-inset-top) gère le positionnement du contenu
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }
}
